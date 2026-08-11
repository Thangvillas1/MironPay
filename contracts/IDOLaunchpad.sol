// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title IDOLaunchpad
 * @notice One contract, many sales. MironPay admin registers a sale per
 *         approved project (createSale); Agent Wallets contribute USDC
 *         directly on-chain (contribute). First-come-first-served is
 *         enforced by the chain itself: whichever contribute() tx is mined
 *         first fills the cap, any later tx that would exceed it reverts —
 *         no off-chain queue or ordering logic needed.
 */
contract IDOLaunchpad {
    address public admin;
    address public immutable usdc;

    struct Sale {
        address treasury;
        uint256 cap;              // hardcap, USDC micro-units (6 decimals)
        uint256 minRaise;         // softcap — below this at endTime, contributors get refunds instead
        uint256 minContribution;
        uint256 maxContribution;  // per-wallet cap
        uint64 startTime;
        uint64 endTime;
        uint256 totalRaised;
        bool withdrawn;
        bool exists;
        address tokenAddress;     // project's own ERC-20, deposited by them, never minted by this contract
        uint8 tokenDecimals;
        uint256 priceMicro;       // micro-USDC per whole token — contribution / priceMicro = whole tokens owed
        uint256 tokensDeposited;
    }

    struct CreateSaleParams {
        address treasury;
        uint256 cap;
        uint256 minRaise;
        uint256 minContribution;
        uint256 maxContribution;
        uint64 startTime;
        uint64 endTime;
        address tokenAddress;
        uint8 tokenDecimals;
        uint256 priceMicro;
    }

    mapping(bytes32 => Sale) public sales;
    mapping(bytes32 => mapping(address => uint256)) public contributions;

    event SaleCreated(bytes32 indexed saleId, address treasury, uint256 cap, uint256 minRaise, uint64 startTime, uint64 endTime);
    event Contributed(bytes32 indexed saleId, address indexed contributor, uint256 amount, uint256 totalRaised);
    event Withdrawn(bytes32 indexed saleId, address treasury, uint256 amount);
    event Refunded(bytes32 indexed saleId, address indexed contributor, uint256 amount);
    event TokensDeposited(bytes32 indexed saleId, uint256 amount, uint256 totalDeposited);
    event Claimed(bytes32 indexed saleId, address indexed contributor, uint256 usdcAmount, uint256 tokensOwed);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "IDOLaunchpad: only admin");
        _;
    }

    constructor(address usdcToken) {
        require(usdcToken != address(0), "Zero USDC address");
        admin = msg.sender;
        usdc = usdcToken;
    }

    /// @notice Register a new sale (admin only — called after a submission is approved).
    function createSale(bytes32 saleId, CreateSaleParams calldata p) external onlyAdmin {
        require(!sales[saleId].exists, "Sale already exists");
        require(p.treasury != address(0), "Zero treasury");
        require(p.cap > 0, "Zero cap");
        require(p.minRaise <= p.cap, "minRaise > cap");
        require(p.maxContribution >= p.minContribution, "max < min");
        require(p.endTime > p.startTime, "endTime <= startTime");
        require(p.tokenAddress != address(0), "Zero token address");
        require(p.priceMicro > 0, "Zero price");

        sales[saleId] = Sale({
            treasury: p.treasury,
            cap: p.cap,
            minRaise: p.minRaise,
            minContribution: p.minContribution,
            maxContribution: p.maxContribution,
            startTime: p.startTime,
            endTime: p.endTime,
            totalRaised: 0,
            withdrawn: false,
            exists: true,
            tokenAddress: p.tokenAddress,
            tokenDecimals: p.tokenDecimals,
            priceMicro: p.priceMicro,
            tokensDeposited: 0
        });
        emit SaleCreated(saleId, p.treasury, p.cap, p.minRaise, p.startTime, p.endTime);
    }

    /// @notice The project deposits their own token supply into the sale,
    ///         using their own wallet (never Circle/MironPay-signed — this
    ///         call happens entirely outside this app's custodial flow).
    function depositTokens(bytes32 saleId, uint256 amount) external {
        Sale storage s = sales[saleId];
        require(s.exists, "No such sale");
        require(msg.sender == s.treasury, "Only sale treasury can deposit");
        require(amount > 0, "Zero amount");

        s.tokensDeposited += amount;
        require(IERC20(s.tokenAddress).transferFrom(msg.sender, address(this), amount), "Token transferFrom failed");
        emit TokensDeposited(saleId, amount, s.tokensDeposited);
    }

    /// @notice Claim your token allocation once the sale ended having met its
    ///         softcap. Decimal-agnostic: contribution and priceMicro are both
    ///         in micro-USDC, so contribution/priceMicro is whole tokens, then
    ///         scaled to the token's own atomic units.
    function claim(bytes32 saleId) external {
        Sale storage s = sales[saleId];
        require(s.exists, "No such sale");
        require(block.timestamp > s.endTime, "Sale still live");
        require(s.totalRaised >= s.minRaise, "Softcap not met - use refund");

        uint256 amount = contributions[saleId][msg.sender];
        require(amount > 0, "Nothing to claim");

        uint256 tokensOwed = (amount * (10 ** uint256(s.tokenDecimals))) / s.priceMicro;

        contributions[saleId][msg.sender] = 0;
        require(IERC20(s.tokenAddress).transfer(msg.sender, tokensOwed), "Token transfer failed");
        emit Claimed(saleId, msg.sender, amount, tokensOwed);
    }

    /// @notice Contribute USDC to a live sale. Caller must approve() this
    ///         contract for `amount` USDC first. Reverts if the sale is full —
    ///         that revert IS the first-come-first-served enforcement.
    function contribute(bytes32 saleId, uint256 amount) external {
        Sale storage s = sales[saleId];
        require(s.exists, "No such sale");
        require(block.timestamp >= s.startTime, "Sale not started");
        require(block.timestamp <= s.endTime, "Sale ended");
        require(amount >= s.minContribution, "Below minimum");
        require(s.totalRaised + amount <= s.cap, "Sale full");

        uint256 newTotal = contributions[saleId][msg.sender] + amount;
        require(newTotal <= s.maxContribution, "Exceeds per-wallet max");

        uint256 raisedAfter = s.totalRaised + amount;
        uint256 tokensRequired = (raisedAfter * (10 ** uint256(s.tokenDecimals))) / s.priceMicro;
        require(s.tokensDeposited >= tokensRequired, "Insufficient deposited tokens");
        require(IERC20(s.tokenAddress).balanceOf(address(this)) >= tokensRequired, "Insufficient sale tokens");

        contributions[saleId][msg.sender] = newTotal;
        s.totalRaised = raisedAfter;

        require(IERC20(usdc).transferFrom(msg.sender, address(this), amount), "USDC transferFrom failed");
        emit Contributed(saleId, msg.sender, amount, s.totalRaised);
    }

    /// @notice Withdraw all raised USDC to the sale's treasury (admin only, after sale ends).
    function withdrawRaised(bytes32 saleId) external onlyAdmin {
        Sale storage s = sales[saleId];
        require(s.exists, "No such sale");
        require(block.timestamp > s.endTime, "Sale still live");
        require(!s.withdrawn, "Already withdrawn");
        require(s.totalRaised >= s.minRaise, "Softcap not met - use refund");
        uint256 tokensRequired = (s.totalRaised * (10 ** uint256(s.tokenDecimals))) / s.priceMicro;
        require(s.tokensDeposited >= tokensRequired, "Insufficient deposited tokens");
        require(IERC20(s.tokenAddress).balanceOf(address(this)) >= tokensRequired, "Insufficient sale tokens");

        s.withdrawn = true;
        uint256 amount = s.totalRaised;
        require(IERC20(usdc).transfer(s.treasury, amount), "USDC transfer failed");
        emit Withdrawn(saleId, s.treasury, amount);
    }

    /// @notice Claim a refund of your own contribution if the sale ended
    ///         without reaching its softcap (minRaise). Zeroes the caller's
    ///         contribution before transferring, so this can't be replayed.
    function refund(bytes32 saleId) external {
        Sale storage s = sales[saleId];
        require(s.exists, "No such sale");
        require(block.timestamp > s.endTime, "Sale still live");
        require(s.totalRaised < s.minRaise, "Softcap met - no refunds");

        uint256 amount = contributions[saleId][msg.sender];
        require(amount > 0, "Nothing to refund");

        contributions[saleId][msg.sender] = 0;
        require(IERC20(usdc).transfer(msg.sender, amount), "USDC transfer failed");
        emit Refunded(saleId, msg.sender, amount);
    }

    function getContribution(bytes32 saleId, address contributor) external view returns (uint256) {
        return contributions[saleId][contributor];
    }

    function remainingCap(bytes32 saleId) external view returns (uint256) {
        Sale storage s = sales[saleId];
        if (!s.exists || s.totalRaised >= s.cap) return 0;
        return s.cap - s.totalRaised;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Zero address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }
}
