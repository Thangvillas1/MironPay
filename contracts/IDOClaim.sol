// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IIDOLaunchpad {
    function sales(bytes32 saleId) external view returns (
        address treasury,
        uint256 cap,
        uint256 minContribution,
        uint256 maxContribution,
        uint64 startTime,
        uint64 endTime,
        uint256 totalRaised,
        bool withdrawn,
        bool exists
    );
    function getContribution(bytes32 saleId, address contributor) external view returns (uint256);
}

/**
 * @title IDOClaim
 * @notice Companion to IDOLaunchpad — handles project-token distribution and
 *         on-chain vesting after a sale closes. One contract, many sales.
 *         Reads raise state (totalRaised, per-wallet contribution, endTime)
 *         straight off IDOLaunchpad, never duplicates it.
 *
 *         Flow: project deposits `tokensForSale` (sized for the sale's full
 *         cap, worst-case) directly to this contract's address before the
 *         sale runs -> admin confirms the deposit and calls registerClaim()
 *         -> after the sale ends, buyers claim() their vested share ->
 *         admin can refundUnsold() any tokens left over if the sale didn't
 *         fill (proportional gap between cap and actual totalRaised).
 */
contract IDOClaim {
    address public admin;
    IIDOLaunchpad public immutable launchpad;

    struct ClaimConfig {
        address token;
        uint256 tokensForSale;   // deposited amount, sized to the sale's cap
        uint16 tgeBps;           // % (basis points, 0-10000) unlocked at TGE
        uint64 cliffSeconds;     // seconds after TGE before linear vesting starts
        uint64 vestingSeconds;   // duration of linear release after the cliff
        bool registered;
        bool unsoldRefunded;
    }

    mapping(bytes32 => ClaimConfig) public claims;
    mapping(bytes32 => mapping(address => uint256)) public claimed;

    event ClaimRegistered(bytes32 indexed saleId, address token, uint256 tokensForSale, uint16 tgeBps, uint64 cliffSeconds, uint64 vestingSeconds);
    event Claimed(bytes32 indexed saleId, address indexed user, uint256 amount);
    event UnsoldRefunded(bytes32 indexed saleId, address to, uint256 amount);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "IDOClaim: only admin");
        _;
    }

    constructor(address launchpadAddress) {
        require(launchpadAddress != address(0), "Zero launchpad address");
        admin = msg.sender;
        launchpad = IIDOLaunchpad(launchpadAddress);
    }

    /// @notice Register vesting terms for a sale (admin only). Project must have
    ///         already transferred `tokensForSale` worth of its token to this
    ///         contract's address — checked via balanceOf before registering.
    function registerClaim(
        bytes32 saleId,
        address token,
        uint256 tokensForSale,
        uint16 tgeBps,
        uint64 cliffSeconds,
        uint64 vestingSeconds
    ) external onlyAdmin {
        require(!claims[saleId].registered, "Already registered");
        require(token != address(0), "Zero token address");
        require(tokensForSale > 0, "Zero tokensForSale");
        require(tgeBps <= 10000, "tgeBps > 100%");
        require(IERC20(token).balanceOf(address(this)) >= tokensForSale, "Deposit not received");

        claims[saleId] = ClaimConfig({
            token: token,
            tokensForSale: tokensForSale,
            tgeBps: tgeBps,
            cliffSeconds: cliffSeconds,
            vestingSeconds: vestingSeconds,
            registered: true,
            unsoldRefunded: false
        });

        emit ClaimRegistered(saleId, token, tokensForSale, tgeBps, cliffSeconds, vestingSeconds);
    }

    /// @notice Total amount `user` has unlocked so far (TGE + linear vesting since the cliff).
    ///         TGE is anchored to the sale's on-chain endTime. Entitlement is computed at
    ///         the sale's fixed price (tokensForSale / cap), matching the displayed token
    ///         price regardless of whether the sale fully filled — NOT proportional to
    ///         totalRaised, which would let under-filled sales inflate everyone's payout.
    function vestedAmount(bytes32 saleId, address user) public view returns (uint256) {
        ClaimConfig storage c = claims[saleId];
        if (!c.registered) return 0;

        (, uint256 cap, , , , uint64 endTime, , , ) = launchpad.sales(saleId);
        if (cap == 0 || block.timestamp < endTime) return 0;

        uint256 contribution = launchpad.getContribution(saleId, user);
        if (contribution == 0) return 0;

        uint256 entitlement = (contribution * c.tokensForSale) / cap;
        uint256 tgeAmount = (entitlement * c.tgeBps) / 10000;

        uint256 cliffEnd = uint256(endTime) + c.cliffSeconds;
        if (block.timestamp < cliffEnd) return tgeAmount;

        if (c.vestingSeconds == 0) return entitlement;

        uint256 vestEnd = cliffEnd + c.vestingSeconds;
        if (block.timestamp >= vestEnd) return entitlement;

        uint256 elapsed = block.timestamp - cliffEnd;
        uint256 remaining = entitlement - tgeAmount;
        return tgeAmount + (remaining * elapsed) / c.vestingSeconds;
    }

    /// @notice Amount `user` can claim right now (vested minus already claimed).
    function claimable(bytes32 saleId, address user) public view returns (uint256) {
        uint256 vested = vestedAmount(saleId, user);
        uint256 already = claimed[saleId][user];
        return vested > already ? vested - already : 0;
    }

    /// @notice Claim your currently-unlocked share of the sale's token.
    function claim(bytes32 saleId) external {
        uint256 amount = claimable(saleId, msg.sender);
        require(amount > 0, "Nothing to claim");

        claimed[saleId][msg.sender] += amount;
        require(IERC20(claims[saleId].token).transfer(msg.sender, amount), "Transfer failed");

        emit Claimed(saleId, msg.sender, amount);
    }

    /// @notice Recover tokens left over from a sale that didn't fill its cap
    ///         (admin only, after the sale ends). Refunds the proportional
    ///         gap between what was deposited (sized for full cap) and what
    ///         buyers are actually entitled to (sized to totalRaised).
    function refundUnsold(bytes32 saleId, address to) external onlyAdmin {
        ClaimConfig storage c = claims[saleId];
        require(c.registered, "No such claim");
        require(!c.unsoldRefunded, "Already refunded");

        (, uint256 cap, , , , uint64 endTime, uint256 totalRaised, , ) = launchpad.sales(saleId);
        require(block.timestamp > endTime, "Sale still live");

        c.unsoldRefunded = true;

        uint256 owedToBuyers = cap == 0 ? 0 : (c.tokensForSale * totalRaised) / cap;
        uint256 unsold = c.tokensForSale > owedToBuyers ? c.tokensForSale - owedToBuyers : 0;

        if (unsold > 0) {
            require(IERC20(c.token).transfer(to, unsold), "Refund transfer failed");
            emit UnsoldRefunded(saleId, to, unsold);
        }
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Zero address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }
}
