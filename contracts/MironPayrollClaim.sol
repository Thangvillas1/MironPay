// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title ClaimBox
 * @notice Minimal, identical-bytecode contract deployed via CREATE2 at a
 *         precomputed address per payroll recipient. Holds no logic beyond
 *         "sweep my balance to whoever the factory tells me to" — the
 *         factory is hardcoded as msg.sender of the constructor, so only
 *         the deploying MironPayrollClaim contract can ever call sweep().
 *         Constructor takes NO arguments so the CREATE2 address depends only
 *         on (factory, salt) — never on who ends up receiving the funds.
 *         This is what lets the address be computed and published (and paid
 *         into) *before* anyone knows whether it will be claimed or reclaimed.
 */
contract ClaimBox {
    address public immutable factory;

    constructor() {
        factory = msg.sender;
    }

    function sweep(address token, address to) external {
        require(msg.sender == factory, "ClaimBox: only factory");
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(IERC20(token).transfer(to, bal), "ClaimBox: sweep failed");
    }
}

/**
 * @title MironPayrollClaim
 * @notice Payroll router for recipients identified only by an off-chain
 *         boxId (recommended: keccak256(lowercased, trimmed email)) — the
 *         contract never sees or stores email/name/company context, only
 *         opaque bytes32 ids, matching the privacy-by-obscurity design.
 *
 *         Money never pools in this contract. payBatch() sends each
 *         recipient's USDC straight to their own precomputed ClaimBox
 *         address (transferFrom company -> boxAddr) in the same
 *         transaction that also takes the 0.1% platform fee to `admin`.
 *
 *         A box has exactly two mutually exclusive exits, both enforced by
 *         the EVM itself (CREATE2 to an address that already has code
 *         reverts), not by a separate "claimed" boolean that could have a
 *         logic bug:
 *           1. claim()   — the real recipient wallet signs proof of
 *                          ownership; verified on-chain via ecrecover, never
 *                          trusting any off-chain database mapping.
 *           2. reclaim() — only the original paying company, only after the
 *                          box's expiry, gets an unclaimed box's funds back.
 *         Whichever happens first deploys the ClaimBox at that address,
 *         which permanently blocks the other path from ever succeeding.
 */
contract MironPayrollClaim {
    address public admin;
    address public immutable usdc;
    uint256 public feeBps = 10; // 0.1% default, admin-adjustable
    uint256 public constant MAX_FEE_BPS = 1000; // hard cap 10%, sanity bound
    bytes32 public immutable boxInitCodeHash;

    struct BoxMeta {
        address company;
        uint64 expiry;
        bool exists;
    }

    mapping(bytes32 => BoxMeta) public boxes;

    event PayrollPaid(bytes32 indexed boxId, address indexed company, uint256 amount, uint64 expiry);
    event FeeCharged(address indexed company, uint256 feeAmount);
    event Claimed(bytes32 indexed boxId, address indexed recipient, uint256 amount);
    event Reclaimed(bytes32 indexed boxId, address indexed company, uint256 amount);
    event FeeBpsUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "MironPayrollClaim: only admin");
        _;
    }

    constructor(address usdcToken) {
        require(usdcToken != address(0), "Zero USDC address");
        admin = msg.sender;
        usdc = usdcToken;
        boxInitCodeHash = keccak256(type(ClaimBox).creationCode);
    }

    /// @notice Deterministic address for a given boxId — safe to compute and
    ///         show to a company (or publish in a claim email) before the
    ///         box has ever been funded or deployed.
    function computeBoxAddress(bytes32 boxId) public view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), boxId, boxInitCodeHash)
        );
        return address(uint160(uint256(hash)));
    }

    /// @notice Pay a batch of recipients in one transaction. Caller (the
    ///         company) must have approved this contract for at least
    ///         sum(amounts) + fee beforehand. Every recipient — new or
    ///         returning MironPay user alike — is paid via ClaimBox; there
    ///         is no "instant transfer to known wallet" shortcut in this
    ///         version (Beta 1.1.1 scope: uniform flow, no pre-registration).
    /// @param boxIds        Off-chain-derived recipient ids (e.g. hash of email)
    /// @param amounts       USDC micro-units per recipient, same order as boxIds
    /// @param expirySeconds How long until the company can reclaim an unclaimed box
    function payBatch(
        bytes32[] calldata boxIds,
        uint256[] calldata amounts,
        uint64 expirySeconds
    ) external {
        require(boxIds.length == amounts.length, "Length mismatch");
        require(boxIds.length > 0, "Empty batch");
        require(expirySeconds > 0, "Zero expiry");

        uint256 total = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "Zero amount");
            total += amounts[i];
        }

        uint256 fee = (total * feeBps) / 10000;
        if (fee > 0) {
            require(IERC20(usdc).transferFrom(msg.sender, admin, fee), "Fee transfer failed");
            emit FeeCharged(msg.sender, fee);
        }

        uint64 expiry = uint64(block.timestamp) + expirySeconds;
        for (uint256 i = 0; i < boxIds.length; i++) {
            bytes32 boxId = boxIds[i];
            address boxAddr = computeBoxAddress(boxId);
            require(boxAddr.code.length == 0, "Box already claimed/reclaimed");

            BoxMeta storage meta = boxes[boxId];
            if (meta.exists) {
                require(meta.company == msg.sender, "boxId used by another company");
            }
            meta.company = msg.sender;
            meta.expiry = expiry;
            meta.exists = true;

            require(IERC20(usdc).transferFrom(msg.sender, boxAddr, amounts[i]), "USDC transferFrom failed");
            emit PayrollPaid(boxId, msg.sender, amounts[i], expiry);
        }
    }

    /// @notice Claim a box's funds. Anyone may submit this transaction (e.g.
    ///         MironPay's gas-sponsoring relayer) — security comes entirely
    ///         from the signature check, not from who calls this function.
    /// @param boxId      The recipient id being claimed
    /// @param recipient  The wallet that will receive the funds, and that
    ///                   must have produced `signature`
    /// @param signature  ECDSA signature over keccak256(boxId, recipient,
    ///                   address(this), block.chainid), signed by recipient's
    ///                   own wallet (e.g. via Circle signTypedData/personal_sign)
    function claim(bytes32 boxId, address recipient, bytes calldata signature) external {
        BoxMeta memory meta = boxes[boxId];
        require(meta.exists, "Unknown box");
        require(recipient != address(0), "Zero recipient");

        address boxAddr = computeBoxAddress(boxId);
        require(boxAddr.code.length == 0, "Already claimed or reclaimed");

        bytes32 message = keccak256(abi.encodePacked(boxId, recipient, address(this), block.chainid));
        bytes32 ethSigned = _toEthSignedMessageHash(message);
        address signer = _recoverSigner(ethSigned, signature);
        require(signer == recipient, "Invalid signature");

        uint256 amount = IERC20(usdc).balanceOf(boxAddr);

        ClaimBox box = new ClaimBox{salt: boxId}();
        require(address(box) == boxAddr, "CREATE2 address mismatch");
        box.sweep(usdc, recipient);

        emit Claimed(boxId, recipient, amount);
    }

    /// @notice Return an unclaimed box's funds to the company that paid it,
    ///         only after that box's expiry has passed. Only the exact
    ///         company wallet that funded the box may call this.
    function reclaim(bytes32 boxId) external {
        BoxMeta memory meta = boxes[boxId];
        require(meta.exists, "Unknown box");
        require(msg.sender == meta.company, "Not the paying company");
        require(block.timestamp > meta.expiry, "Not expired yet");

        address boxAddr = computeBoxAddress(boxId);
        require(boxAddr.code.length == 0, "Already claimed or reclaimed");

        uint256 amount = IERC20(usdc).balanceOf(boxAddr);

        ClaimBox box = new ClaimBox{salt: boxId}();
        require(address(box) == boxAddr, "CREATE2 address mismatch");
        box.sweep(usdc, meta.company);

        emit Reclaimed(boxId, meta.company, amount);
    }

    /// @notice Adjust the platform fee (admin only), capped at MAX_FEE_BPS.
    function setFeeBps(uint256 newFeeBps) external onlyAdmin {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");
        emit FeeBpsUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Zero address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    // ---- Minimal ECDSA recovery (no external library, matches existing
    //      contracts' style of self-contained code with no imports) ----

    function _toEthSignedMessageHash(bytes32 hash) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function _recoverSigner(bytes32 ethSignedHash, bytes calldata sig) private pure returns (address) {
        require(sig.length == 65, "Bad signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Bad signature v");
        return ecrecover(ethSignedHash, v, r, s);
    }
}
