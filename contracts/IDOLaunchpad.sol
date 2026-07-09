// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
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
        uint256 cap;              // target raise, USDC micro-units (6 decimals)
        uint256 minContribution;
        uint256 maxContribution;  // per-wallet cap
        uint64 startTime;
        uint64 endTime;
        uint256 totalRaised;
        bool withdrawn;
        bool exists;
    }

    mapping(bytes32 => Sale) public sales;
    mapping(bytes32 => mapping(address => uint256)) public contributions;

    event SaleCreated(bytes32 indexed saleId, address treasury, uint256 cap, uint64 startTime, uint64 endTime);
    event Contributed(bytes32 indexed saleId, address indexed contributor, uint256 amount, uint256 totalRaised);
    event Withdrawn(bytes32 indexed saleId, address treasury, uint256 amount);
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
    function createSale(
        bytes32 saleId,
        address treasury,
        uint256 cap,
        uint256 minContribution,
        uint256 maxContribution,
        uint64 startTime,
        uint64 endTime
    ) external onlyAdmin {
        require(!sales[saleId].exists, "Sale already exists");
        require(treasury != address(0), "Zero treasury");
        require(cap > 0, "Zero cap");
        require(maxContribution >= minContribution, "max < min");
        require(endTime > startTime, "endTime <= startTime");

        sales[saleId] = Sale({
            treasury: treasury,
            cap: cap,
            minContribution: minContribution,
            maxContribution: maxContribution,
            startTime: startTime,
            endTime: endTime,
            totalRaised: 0,
            withdrawn: false,
            exists: true
        });
        emit SaleCreated(saleId, treasury, cap, startTime, endTime);
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

        contributions[saleId][msg.sender] = newTotal;
        s.totalRaised += amount;

        require(IERC20(usdc).transferFrom(msg.sender, address(this), amount), "USDC transferFrom failed");
        emit Contributed(saleId, msg.sender, amount, s.totalRaised);
    }

    /// @notice Withdraw all raised USDC to the sale's treasury (admin only, after sale ends).
    function withdrawRaised(bytes32 saleId) external onlyAdmin {
        Sale storage s = sales[saleId];
        require(s.exists, "No such sale");
        require(block.timestamp > s.endTime, "Sale still live");
        require(!s.withdrawn, "Already withdrawn");

        s.withdrawn = true;
        uint256 amount = s.totalRaised;
        require(IERC20(usdc).transfer(s.treasury, amount), "USDC transfer failed");
        emit Withdrawn(saleId, s.treasury, amount);
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
