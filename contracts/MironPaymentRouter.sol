// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/**
 * @title DepositBox
 * @notice Minimal per-order custody, controlled exclusively by its deploying router.
 * @dev No constructor arguments: every order uses identical creation bytecode.
 * Native receipts are accepted. On Arc, native USDC and ERC-20 USDC are two views
 * of the same balance. The router sweeps only credited tokens (fees and merchant
 * net), or merchant-authorized excess refunds. Native sweeps are amount-limited:
 * for USDC orders only the sub-1e12 native remainder may be forwarded as dust,
 * never the whole-unit backing of held excess or unsettled USDC. Failed native
 * sends leave the requested amount in the box.
 */
contract DepositBox {
    using SafeERC20 for IERC20;

    /// @notice The only account allowed to sweep; fixed at deployment.
    address public immutable factory = msg.sender;

    /// @notice The caller is not the deploying factory.
    error OnlyFactory();
    /// @notice The recipient did not receive exactly the requested token amount.
    /// @param token Asset being transferred.
    /// @param to Intended recipient.
    /// @param expected Requested token amount.
    /// @param actual Observed nonnegative recipient balance increase.
    error InexactTransfer(address token, address to, uint256 expected, uint256 actual);

    /**
     * @notice Send an exact token amount directly to a recipient.
     * @dev Accepts tokens returning no bool; false returns and reverts fail atomically.
     * Recipient balance verification rejects short delivery, including transfer taxes.
     * Fee-on-transfer and rebasing tokens are not supported. Token balance reporting
     * must be honest; arbitrary malicious token contracts cannot be made trustworthy.
     * @param token ERC-20 to transfer.
     * @param to Recipient of the transfer.
     * @param amount Exact amount in token base units.
     */
    function sweep(address token, address to, uint256 amount) external {
        if (msg.sender != factory) revert OnlyFactory();
        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(to);
        asset.safeTransfer(to, amount);
        uint256 afterBalance = asset.balanceOf(to);
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) {
            revert InexactTransfer(token, to, amount, afterBalance >= beforeBalance ? afterBalance - beforeBalance : 0);
        }
    }

    /**
     * @notice Attempt to send exactly the requested native amount to a recipient.
     * @dev Only the factory may call. Zero or above-balance requests return false
     * without sending; they are not reduced to the available balance. A failed send
     * never reverts; forwards at most 30_000 gas with no returndata copy.
     * @param to Recipient of the native amount.
     * @param amount Exact native wei to forward, selected by the router's dust rule.
     * @return ok Whether the native send succeeded.
     */
    function sweepNative(address to, uint256 amount) external returns (bool ok) {
        if (msg.sender != factory) revert OnlyFactory();
        if (amount == 0 || amount > address(this).balance) return false;
        // Assembly call with no returndata copy: a hostile `to` cannot return-bomb the box.
        assembly ("memory-safe") {
            ok := call(30000, to, amount, 0, 0, 0, 0)
        }
    }

    /// @notice Accept native value after deployment (including Arc native USDC).
    receive() external payable {}
}

/**
 * @title MironPaymentRouter
 * @notice MironPay Store: capped credit and merchant-controlled excess at CREATE2 boxes.
 * @dev No order-registration transaction or trusted backend is needed. The full order
 * binds its merchant, token, amount and expiry to its CREATE2 address. Settlement is
 * permissionless; credited funds go only to the bound merchant, less the fixed 0.1%
 * fee. Held excess stays in the box and leaves only through merchant-only refundExcess,
 * whose destination the merchant chooses. There is no automatic payer refund.
 * The only administrative power is two-step fee-recipient rotation. There is no
 * other admin, pause, upgradeability or recovery power. The router never custodies
 * settlement funds: boxes transfer directly to recipients, and pay forwards all
 * msg.value immediately. Unsolicited token transfers or forced native value to the
 * router cannot be prevented or recovered. Router addresses are rejected as merchant,
 * fee and refund destinations.
 *
 * Intended for Arc Testnet (5042002), without a chain restriction. On Arc, USDC at
 * the constant USDC address has native (18-decimal) and ERC-20 (6-decimal) views of
 * one underlying balance: balanceOf(box) = floor(nativeBalance / 1e12), even before
 * box deployment. All order accounting uses ERC-20 base units. pay accepts native
 * USDC only, in positive multiples of NATIVE_SCALE, rejects expired orders and
 * overpayment including pending credit, and neither deploys nor settles the box.
 * Direct transfers to the box remain possible for USDC and other ERC-20 orders.
 * Credit is capped at the order amount; excess is held separately and never charged
 * a fee. Failed fee sweeps forfeit that settlement's fee rather than deferring it.
 * A mandatory merchant sweep failure reverts the entire settlement, including fees,
 * accounting, events and any deployment. Exact recipient deltas are required;
 * transfer-tax/rebasing tokens and dishonest token balance reporting are unsupported.
 *
 * After a successful settlement, native dust is forwarded best-effort, fee-free,
 * to the merchant and excluded from credit, excess and order status. For USDC,
 * only nativeBalance % NATIVE_SCALE is dust: this cannot move the whole-unit native
 * backing of held excess or unsettled USDC. For other tokens, unrelated native value
 * is all dust and cannot move held excess of that ERC-20. Failed native sends or
 * merchant receives needing more than 30_000 gas leave dust in the box. Dust or
 * already-recorded excess alone cannot trigger settlement; new token funds are needed.
 *
 * Expiry zero means never expires. Expiry prevents pay after the deadline but never
 * prevents direct deposits, settlement or refunds. Lateness is observational, since
 * there is no on-chain receipt timestamp before settlement. Late is sticky only when
 * positive credit is settled after expiry; an excess-only settlement never marks an
 * already-paid order late. Views likewise project lateness only for pending credit.
 */
contract MironPaymentRouter is ReentrancyGuard {
    /// @notice Immutable fee rate: 10 basis points (0.1%).
    uint256 public constant FEE_BPS = 10;
    /// @notice Basis-point denominator.
    uint256 public constant BPS = 10_000;
    /// @notice Arc USDC ERC-20 view of the native asset; the only asset accepted by pay.
    address public constant USDC = 0x3600000000000000000000000000000000000000;
    /// @notice Native wei per USDC ERC-20 base unit on Arc.
    uint256 public constant NATIVE_SCALE = 1e12;
    /// @notice No settled or pending credit.
    uint8 public constant NONE = 0;
    /// @notice Positive credit below the order amount.
    uint8 public constant UNDERPAID = 1;
    /// @notice Credit equals the order amount with no unrefunded excess.
    uint8 public constant PAID = 2;
    /// @notice Fully paid with positive unrefunded excess, including pending excess in views.
    uint8 public constant OVERPAID = 3;

    /// @notice Full immutable payment instructions committed by an order address.
    /// @param orderId Merchant-supplied identifier; uniqueness is not enforced.
    /// @param merchant Destination of net payments and sole authority for excess refunds.
    /// @param token ERC-20 asset, with amounts denominated in its base units.
    /// @param amount Positive target gross credit, before fees; a hard credit cap.
    /// @param expiry Unix timestamp; zero means never expires.
    struct Order {
        bytes32 orderId;
        address merchant;
        address token;
        uint256 amount;
        uint64 expiry;
    }

    /// @notice Cumulative settlement accounting; settledAt and late share one slot.
    /// @param credited Gross settled credit, capped at the order amount.
    /// @param excessHeld Recorded unrefunded excess still held in the box.
    /// @param totalFee Cumulative actual fees, rounded down per credited settlement.
    /// @param excessRefunded Cumulative merchant-authorized excess refunds.
    /// @param settledAt Unix timestamp of the latest successful settlement, including excess-only calls.
    /// @param late Sticky flag for positive credit settled after nonzero expiry.
    struct OrderState {
        uint256 credited;
        uint256 excessHeld;
        uint256 totalFee;
        uint256 excessRefunded;
        uint64 settledAt;
        bool late;
    }

    /// @notice Wallet-facing projection including funds not yet settled.
    /// @param status NONE, UNDERPAID, PAID or OVERPAID based on settled and projected credit/excess.
    /// @param credited Settled gross credit only, excluding pending funds and excess.
    /// @param pendingInBox Unsettled new token funds, excluding recorded excessHeld.
    /// @param excess Recorded held excess plus pending funds beyond the remaining credit cap.
    /// @param late Stored lateness or positive projected credit observed after expiry.
    /// @param expired Whether the nonzero expiry is strictly before the current timestamp.
    /// @param depositAddress Counterfactual or deployed box address.
    struct OrderView {
        uint8 status;
        uint256 credited;
        uint256 pendingInBox;
        uint256 excess;
        bool late;
        bool expired;
        address depositAddress;
    }

    /// @dev In-memory settlement summary used to emit Settled without stack pressure.
    struct SettlementAmounts {
        uint256 credited;
        uint256 fee;
        uint256 net;
        uint256 excess;
        uint8 status;
    }

    /// @notice Recipient of settlement fees and sole fee-rotation proposer.
    address public feeRecipient;
    /// @notice Proposed successor, which must accept its role.
    address public pendingFeeRecipient;
    /// @notice Settled accounting keyed by keccak256(abi.encode(order)).
    mapping(bytes32 => OrderState) public orders;

    /// @notice An order has a zero token, invalid merchant, or zero amount.
    /// @param orderId Identifier of the rejected order.
    error InvalidOrder(bytes32 orderId);
    /// @notice Fee destination is zero or the router itself.
    /// @param rejected Rejected destination.
    error InvalidFeeRecipient(address rejected);
    /// @notice Caller lacks the required fee-rotation or merchant refund role.
    /// @param caller Unauthorized caller.
    /// @param expected Required caller.
    error Unauthorized(address caller, address expected);
    /// @notice The box has no new token funds after excluding recorded held excess.
    /// @param orderKey Hash of the full order.
    /// @param depositAddress Box with no new funds to settle.
    error ZeroBalance(bytes32 orderKey, address depositAddress);
    /// @notice Native pay supports only orders denominated in Arc USDC.
    /// @param token Rejected order token.
    error NotUsdcOrder(address token);
    /// @notice Native pay requires positive msg.value.
    error ZeroValue();
    /// @notice Native payment is not an exact multiple of NATIVE_SCALE.
    /// @param value Rejected msg.value in native wei.
    error UnalignedValue(uint256 value);
    /// @notice Native pay was attempted strictly after a nonzero expiry.
    /// @param expiry Order deadline.
    error OrderExpired(uint64 expiry);
    /// @notice Native pay exceeds remaining credit after settled and pending funds.
    /// @param outstanding Remaining credit available in ERC-20 base units, possibly zero.
    /// @param units Requested native payment expressed in ERC-20 base units.
    error Overpayment(uint256 outstanding, uint256 units);
    /// @notice Forwarding msg.value to the box failed; the payment reverts atomically.
    error PaymentForwardFailed();
    /// @notice Refund destination is zero or the router itself.
    /// @param to Rejected refund destination.
    error InvalidRecipient(address to);
    /// @notice Refund is zero or exceeds recorded held excess.
    /// @param requested Requested refund in ERC-20 base units.
    /// @param excessHeld Currently recorded refundable excess.
    error InvalidRefund(uint256 requested, uint256 excessHeld);

    /// @notice A current fee recipient nominated a successor.
    /// @param currentFeeRecipient Current recipient.
    /// @param proposedFeeRecipient Nominated successor.
    event FeeRecipientProposed(address indexed currentFeeRecipient, address indexed proposedFeeRecipient);
    /// @notice Fee-recipient ownership changed.
    /// @param previousFeeRecipient Previous recipient (zero at initialization).
    /// @param newFeeRecipient New recipient.
    event FeeRecipientChanged(address indexed previousFeeRecipient, address indexed newFeeRecipient);
    /// @notice Native USDC was forwarded to the box without deploying or settling it.
    /// @param orderKey Hash of the full order.
    /// @param orderId Merchant-supplied order identifier.
    /// @param payer Caller whose msg.value was forwarded.
    /// @param units Payment in ERC-20 USDC base units, not native wei.
    event Paid(bytes32 indexed orderKey, bytes32 indexed orderId, address indexed payer, uint256 units);
    /// @notice New box funds were accounted for; emitted before any mandatory merchant sweep.
    /// @param orderKey Hash of the full order.
    /// @param orderId Merchant-supplied order identifier.
    /// @param merchant Bound net-payment recipient.
    /// @param token Settled ERC-20 asset.
    /// @param credited Gross credit for THIS call, excluding excess.
    /// @param fee Actual fee for THIS call, zero if forfeited.
    /// @param net Net merchant payment for THIS call.
    /// @param excess Newly held excess for THIS call, not cumulative excessHeld.
    /// @param status Status based on the updated settled state; late is separate.
    event Settled(
        bytes32 indexed orderKey,
        bytes32 indexed orderId,
        address indexed merchant,
        address token,
        uint256 credited,
        uint256 fee,
        uint256 net,
        uint256 excess,
        uint8 status
    );
    /// @notice Recorded excess was refunded by the bound merchant, without a fee.
    /// @param orderKey Hash of the full order.
    /// @param orderId Merchant-supplied order identifier.
    /// @param to Merchant-selected recipient, not necessarily the original payer.
    /// @param amount Exact token amount refunded.
    event ExcessRefunded(bytes32 indexed orderKey, bytes32 indexed orderId, address indexed to, uint256 amount);

    /// @notice Initialize the sole fee-rotation authority.
    /// @param feeRecipient_ Initial nonzero fee destination, not this router.
    constructor(address feeRecipient_) {
        _validateFeeRecipient(feeRecipient_);
        feeRecipient = feeRecipient_;
        emit FeeRecipientChanged(address(0), feeRecipient_);
    }

    /// @notice Nominate or replace a pending fee recipient.
    /// @param proposed Proposed nonzero recipient, not this router.
    function proposeFeeRecipient(address proposed) external {
        if (msg.sender != feeRecipient) revert Unauthorized(msg.sender, feeRecipient);
        _validateFeeRecipient(proposed);
        pendingFeeRecipient = proposed;
        emit FeeRecipientProposed(msg.sender, proposed);
    }

    /// @notice Accept the pending fee-recipient role; only the nominee may call.
    function acceptFeeRecipient() external {
        if (msg.sender != pendingFeeRecipient) revert Unauthorized(msg.sender, pendingFeeRecipient);
        address previous = feeRecipient;
        feeRecipient = msg.sender;
        pendingFeeRecipient = address(0);
        emit FeeRecipientChanged(previous, msg.sender);
    }

    /// @notice Hash all order fields using standard ABI encoding.
    /// @param o Full order, including its expiry; fields are not validated here.
    /// @return The order key, also used as the CREATE2 salt.
    function orderKey(Order calldata o) external pure returns (bytes32) {
        return keccak256(abi.encode(o));
    }

    /// @notice Predict the box without registering an order or deploying anything.
    /// @param o Full order; this address prediction does not validate its fields.
    /// @return The counterfactual deposit address for this router and order.
    function computeDepositAddress(Order calldata o) public view returns (address) {
        return _depositAddress(keccak256(abi.encode(o)), keccak256(type(DepositBox).creationCode));
    }

    /**
     * @notice Forward an aligned native-USDC payment within the remaining order cap.
     * @dev Validates the order and rejects non-USDC, zero, unaligned, expired or
     * excessive payments. Pending new funds count toward the cap; recorded excess
     * does not. Subtracting capped pending credit avoids any credited + balance
     * overflow. Forwards all msg.value even to an undeployed address, with no box
     * deployment or settlement and no retained payment value. Arc reflects this
     * native transfer in the USDC ERC-20 view at the deposit address.
     * @param o Full valid USDC order to pay.
     */
    function pay(Order calldata o) external payable nonReentrant {
        _validateOrder(o);
        if (o.token != USDC) revert NotUsdcOrder(o.token);
        if (msg.value == 0) revert ZeroValue();
        if (msg.value % NATIVE_SCALE != 0) revert UnalignedValue(msg.value);
        uint256 units = msg.value / NATIVE_SCALE;
        if (o.expiry != 0 && block.timestamp > o.expiry) revert OrderExpired(o.expiry);

        bytes32 key = keccak256(abi.encode(o));
        address depositAddress = computeDepositAddress(o);
        OrderState storage state = orders[key];
        uint256 bal = IERC20(USDC).balanceOf(depositAddress);
        uint256 newFundsInBox = bal > state.excessHeld ? bal - state.excessHeld : 0;
        uint256 outstanding = o.amount - state.credited;
        outstanding -= Math.min(newFundsInBox, outstanding);
        if (units > outstanding) revert Overpayment(outstanding, units);

        (bool ok,) = depositAddress.call{value: msg.value}("");
        if (!ok) revert PaymentForwardFailed();
        emit Paid(key, o.orderId, msg.sender, units);
    }

    /**
     * @notice Deploy the box if necessary, credit up to the cap and record held excess.
     * @dev Permissionless, repeatable, and storage-reentrancy-guarded. Excludes prior
     * excessHeld when identifying new funds; no new funds reverts with ZeroBalance.
     * Fees are floor(creditedNow * 10 / 10000), using full-precision multiplication,
     * never charged on excess. The fee recipient is snapshotted for this call.
     * A failed fee transfer forfeits the fee, not defers it. Supplying too little
     * gas to the fee sweep can also trigger forfeiture; this costs only the platform.
     * Effects and Settled precede the mandatory merchant sweep; failure of that
     * sweep reverts everything atomically. Excess-only calls still record and emit,
     * but transfer no fee or merchant net and never set late. Positive credit after
     * nonzero expiry sets sticky late; expiry never blocks settlement.
     * Afterwards only native dust is forwarded best-effort, outside order accounting:
     * USDC uses nativeBalance % NATIVE_SCALE, which cannot touch the whole-unit
     * backing of excessHeld or unsettled USDC; other tokens use the unrelated native
     * balance. Native failure does not revert settlement. Dust alone cannot settle.
     * @param o Full valid order matching the funded deposit address.
     * @return creditedNow Gross credit added by THIS call, capped at remaining credit.
     * @return fee Actual fee paid by THIS call, zero if forfeited.
     * @return net Exact credited remainder sent to the merchant by THIS call.
     * @return excessNow New excess retained in the box by THIS call.
     */
    function settle(Order calldata o) external nonReentrant returns (
        uint256 creditedNow, uint256 fee, uint256 net, uint256 excessNow
    ) {
        _validateOrder(o);
        bytes32 key = keccak256(abi.encode(o));
        address depositAddress = computeDepositAddress(o);
        if (depositAddress.code.length == 0) {
            new DepositBox{salt: key}();
        }
        OrderState storage state = orders[key];
        {
            uint256 bal = IERC20(o.token).balanceOf(depositAddress);
            uint256 newFunds = bal > state.excessHeld ? bal - state.excessHeld : 0;
            if (newFunds == 0) revert ZeroBalance(key, depositAddress);
            creditedNow = Math.min(newFunds, o.amount - state.credited);
            excessNow = newFunds - creditedNow;
        }
        fee = Math.mulDiv(creditedNow, FEE_BPS, BPS);
        DepositBox box = DepositBox(payable(depositAddress));
        if (fee != 0) {
            try box.sweep(o.token, feeRecipient, fee) {} catch {
                fee = 0;
            }
        }
        net = _record(key, o, state, creditedNow, fee, excessNow);
        if (net > 0) box.sweep(o.token, o.merchant, net);
        uint256 native = depositAddress.balance;
        uint256 dust = o.token == USDC ? native % NATIVE_SCALE : native;
        if (dust != 0) {
            try box.sweepNative(o.merchant, dust) returns (bool) {} catch {}
        }
    }

    /// @dev Apply settlement accounting and emit Settled before the merchant sweep.
    /// @param key Order key.
    /// @param o Full valid order.
    /// @param state Storage record of the order.
    /// @param creditedNow Gross credit added by this settlement.
    /// @param fee Fee actually paid (zero if forfeited).
    /// @param excessNow Excess retained by this settlement.
    /// @return net Amount owed to the merchant for this settlement.
    function _record(
        bytes32 key,
        Order calldata o,
        OrderState storage state,
        uint256 creditedNow,
        uint256 fee,
        uint256 excessNow
    ) private returns (uint256 net) {
        net = creditedNow - fee;
        state.credited += creditedNow;
        state.excessHeld += excessNow;
        state.totalFee += fee;
        state.settledAt = SafeCast.toUint64(block.timestamp);
        if (creditedNow > 0 && o.expiry != 0 && block.timestamp > o.expiry) state.late = true;
        SettlementAmounts memory r = SettlementAmounts({
            credited: creditedNow,
            fee: fee,
            net: net,
            excess: excessNow,
            status: _status(state.credited, state.excessHeld, o.amount)
        });
        _emitSettled(key, o, r);
    }

    /// @dev Emit Settled from a memory struct (keeps the stack shallow).
    /// @param key Order key.
    /// @param o Full valid order.
    /// @param r Amounts and status of this settlement.
    function _emitSettled(bytes32 key, Order calldata o, SettlementAmounts memory r) private {
        emit Settled(key, o.orderId, o.merchant, o.token, r.credited, r.fee, r.net, r.excess, r.status);
    }

    /**
     * @notice Refund recorded excess to a recipient selected by the bound merchant.
     * @dev Merchant-only and fee-free, regardless of expiry or whether excess arrived
     * before or after full payment. Effects precede the exact-delta token sweep;
     * failure reverts accounting atomically. Unsettled excess must first be settled.
     * An undeployed box has no recorded excess and fails with InvalidRefund.
     * @param o Full valid order identifying the held excess.
     * @param to Nonzero refund destination other than this router.
     * @param amount Positive token amount no greater than recorded excessHeld.
     */
    function refundExcess(Order calldata o, address to, uint256 amount) external nonReentrant {
        _validateOrder(o);
        if (msg.sender != o.merchant) revert Unauthorized(msg.sender, o.merchant);
        if (to == address(0) || to == address(this)) revert InvalidRecipient(to);
        bytes32 key = keccak256(abi.encode(o));
        OrderState storage state = orders[key];
        if (amount == 0 || amount > state.excessHeld) revert InvalidRefund(amount, state.excessHeld);

        state.excessHeld -= amount;
        state.excessRefunded += amount;
        emit ExcessRefunded(key, o.orderId, to, amount);
        DepositBox(payable(computeDepositAddress(o))).sweep(o.token, to, amount);
    }

    /**
     * @notice Read wallet-facing order status including unsettled credit and excess.
     * @dev Invalid fields revert InvalidOrder. Reads token.balanceOf even for an
     * undeployed box. Credit is gross, not merchant net. Lateness is observational
     * and excludes pending excess-only funds. Expired is separate from status/late.
     * @param o Full valid order to inspect.
     * @return Projected order view, with credited reporting settled credit only.
     */
    function getOrderStatus(Order calldata o) external view returns (OrderView memory) {
        return _getOrderStatus(o, keccak256(type(DepositBox).creationCode));
    }

    /**
     * @notice Read projected statuses for multiple orders in input order.
     * @dev InvalidOrder for any element reverts the whole call. Token balance read
     * failures also propagate. The box creation-code hash is computed once per batch.
     * @param os Full orders to inspect; an empty array returns an empty array.
     * @return views Projected views with the same semantics as getOrderStatus.
     */
    function getOrderStatuses(Order[] calldata os) external view returns (OrderView[] memory views) {
        bytes32 codeHash = keccak256(type(DepositBox).creationCode);
        views = new OrderView[](os.length);
        for (uint256 i; i < os.length; ++i) {
            views[i] = _getOrderStatus(os[i], codeHash);
        }
    }

    /// @dev Shared validated projection, excluding held excess from unsettled new funds.
    /// @param o Order to inspect.
    /// @param codeHash Cached hash of DepositBox creation bytecode.
    /// @return result Settled credit and projected pending credit/excess, status and lateness.
    function _getOrderStatus(Order calldata o, bytes32 codeHash) private view returns (OrderView memory result) {
        _validateOrder(o);
        bytes32 key = keccak256(abi.encode(o));
        OrderState storage state = orders[key];
        result.depositAddress = _depositAddress(key, codeHash);
        uint256 bal = IERC20(o.token).balanceOf(result.depositAddress);
        result.pendingInBox = bal > state.excessHeld ? bal - state.excessHeld : 0;
        result.credited = state.credited;
        uint256 projectedCredit = Math.min(result.pendingInBox, o.amount - result.credited);
        result.excess = state.excessHeld + (result.pendingInBox - projectedCredit);
        result.status = _status(result.credited + projectedCredit, result.excess, o.amount);
        result.expired = o.expiry != 0 && block.timestamp > o.expiry;
        result.late = state.late || (projectedCredit > 0 && result.expired);
    }

    /// @dev Predict an order's CREATE2 address using a precomputed creation-code hash.
    /// @param salt Hash of the full ABI-encoded order.
    /// @param codeHash Hash of DepositBox creation bytecode, without constructor arguments.
    /// @return Counterfactual box address for this router.
    function _depositAddress(bytes32 salt, bytes32 codeHash) private view returns (address) {
        bytes32 digest = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, codeHash));
        return address(uint160(uint256(digest)));
    }

    /// @dev Reject invalid settlement fields and prevent settlement into the router.
    /// @param o Order to validate.
    function _validateOrder(Order calldata o) private view {
        if (o.merchant == address(0) || o.merchant == address(this) || o.token == address(0) || o.amount == 0) {
            revert InvalidOrder(o.orderId);
        }
    }

    /// @dev Keep fee transfers out of zero and router destinations.
    /// @param recipient Fee destination to validate.
    function _validateFeeRecipient(address recipient) private view {
        if (recipient == address(0) || recipient == address(this)) revert InvalidFeeRecipient(recipient);
    }

    /// @dev Classify capped credit; excess changes PAID to OVERPAID only at full credit.
    /// @param credited Settled or projected gross credit, no greater than target.
    /// @param excess Unrefunded held or projected excess.
    /// @param target Positive order amount.
    /// @return Status constant; expiry and late are deliberately separate.
    function _status(uint256 credited, uint256 excess, uint256 target) private pure returns (uint8) {
        if (credited == target) return excess > 0 ? OVERPAID : PAID;
        if (credited != 0) return UNDERPAID;
        return NONE;
    }
}
