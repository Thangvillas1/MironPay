/* @ds-bundle: {"format":3,"namespace":"MironPayDesignSystem_577c4b","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"VerifiedBadge","sourcePath":"components/core/VerifiedBadge.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"PinDots","sourcePath":"components/forms/PinDots.jsx"},{"name":"MironScoreCard","sourcePath":"components/product/MironScoreCard.jsx"},{"name":"NavItem","sourcePath":"components/product/NavItem.jsx"},{"name":"QuickAction","sourcePath":"components/product/QuickAction.jsx"},{"name":"TokenRow","sourcePath":"components/product/TokenRow.jsx"},{"name":"WalletCard","sourcePath":"components/product/WalletCard.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"d61550479b2e","components/core/Badge.jsx":"8070b667c8b8","components/core/Button.jsx":"f8c9bc4e1219","components/core/IconButton.jsx":"9c99e7a50b00","components/core/VerifiedBadge.jsx":"8a0dce0c2299","components/forms/Input.jsx":"351c5c135bf2","components/forms/PinDots.jsx":"f81020f79f6c","components/product/MironScoreCard.jsx":"5cf9313ee886","components/product/NavItem.jsx":"551c32109037","components/product/QuickAction.jsx":"13e57065a520","components/product/TokenRow.jsx":"ff598eb7a91d","components/product/WalletCard.jsx":"cec6056dde88","ui_kits/mironpay-app/AgentScreen.jsx":"c9ed46f79e69","ui_kits/mironpay-app/DashboardScreen.jsx":"f37b04f6acef","ui_kits/mironpay-app/LoginScreen.jsx":"cc867d83909c","ui_kits/mironpay-app/PinModal.jsx":"29abbbc930b0","ui_kits/mironpay-app/ReceiveScreen.jsx":"770609a4f47a","ui_kits/mironpay-app/SendScreen.jsx":"5747376b1a1e","ui_kits/mironpay-app/app.jsx":"3fa00e523925","ui_kits/mironpay-app/icons.jsx":"cfcf776ff540"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.MironPayDesignSystem_577c4b = window.MironPayDesignSystem_577c4b || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const GRADIENTS = ['linear-gradient(135deg,#5b8cff,#1b4ad6)', 'linear-gradient(135deg,#6d6cff,#3b30c4)', 'linear-gradient(135deg,#22c6e0,#0b86b8)', 'linear-gradient(135deg,#2bd4a4,#0f8f74)', 'linear-gradient(135deg,#7da6ff,#2f6bff)'];
function pick(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = h * 31 + name.charCodeAt(i) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

/** Circular user avatar — image or auto-colored initials, optional verified tick. */
function Avatar({
  name = '',
  src,
  size = 40,
  verified = false,
  style = {},
  ...rest
}) {
  const initials = name.replace('@', '').slice(0, 2).toUpperCase();
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      position: 'relative',
      display: 'inline-flex',
      width: size,
      height: size,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: src ? `center/cover url(${src})` : pick(name),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: size * 0.4,
      letterSpacing: '-0.02em',
      userSelect: 'none'
    }
  }, !src && initials), verified && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: size * 0.42,
      height: size * 0.42,
      borderRadius: '50%',
      background: 'var(--c-page)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size * 0.42,
    height: size * 0.42,
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2l2.4 1.7 2.9-.3 1.2 2.7 2.6 1.4-.6 2.9 1.5 2.5-2 2.1.1 2.9-2.8.8L15.6 22 12 20.6 8.4 22l-1.4-2.4-2.8-.8.1-2.9-2-2.1L3.8 11l-.6-2.9 2.6-1.4 1.2-2.7 2.9.3L12 2z",
    fill: "var(--c-blue-accent)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 12.2l2.3 2.3 4.6-4.8",
    stroke: "#fff",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Small status / category pill. */
function Badge({
  children,
  tone = 'neutral',
  dot = false,
  style = {},
  ...rest
}) {
  const tones = {
    neutral: {
      bg: 'var(--c-input)',
      fg: 'var(--c-muted)',
      dotc: 'var(--c-muted)'
    },
    success: {
      bg: 'rgba(34,197,94,0.14)',
      fg: 'var(--c-success)',
      dotc: 'var(--c-success)'
    },
    error: {
      bg: 'rgba(239,68,68,0.14)',
      fg: 'var(--c-error)',
      dotc: 'var(--c-error)'
    },
    warning: {
      bg: 'rgba(245,158,11,0.14)',
      fg: 'var(--c-warning)',
      dotc: 'var(--c-warning)'
    },
    info: {
      bg: 'rgba(96,165,250,0.14)',
      fg: 'var(--c-blue-accent)',
      dotc: 'var(--c-blue-accent)'
    },
    brand: {
      bg: 'rgba(47,107,255,0.16)',
      fg: 'var(--c-purple-accent)',
      dotc: 'var(--c-purple-accent)'
    }
  };
  const t = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 24,
      padding: '0 10px',
      borderRadius: 'var(--radius-full)',
      background: t.bg,
      color: t.fg,
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: t.dotc
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * MironPay primary button. Purple-filled by default; subtle, fast hover.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  leadingIcon = null,
  trailingIcon = null,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: {
      padding: '0 14px',
      height: 36,
      fontSize: 13,
      radius: 10,
      gap: 7
    },
    md: {
      padding: '0 18px',
      height: 44,
      fontSize: 15,
      radius: 12,
      gap: 8
    },
    lg: {
      padding: '0 22px',
      height: 52,
      fontSize: 16,
      radius: 14,
      gap: 9
    }
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    primary: {
      background: 'var(--grad-primary)',
      color: 'var(--c-on-primary)',
      border: '1px solid transparent',
      boxShadow: 'var(--glow-primary), inset 0 1px 0 rgba(255,255,255,0.18)'
    },
    secondary: {
      background: 'var(--c-panel-2)',
      color: 'var(--c-text)',
      border: '1px solid var(--c-border-strong)',
      boxShadow: 'none'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--c-text)',
      border: '1px solid transparent',
      boxShadow: 'none'
    },
    danger: {
      background: 'var(--c-error)',
      color: '#fff',
      border: '1px solid transparent',
      boxShadow: 'none'
    }
  };
  const v = variants[variant] || variants.primary;
  const isOff = disabled || loading;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: isOff,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s.gap,
      height: s.height,
      padding: s.padding,
      width: fullWidth ? '100%' : 'auto',
      fontFamily: 'var(--font-sans)',
      fontSize: s.fontSize,
      fontWeight: 600,
      lineHeight: 1,
      borderRadius: s.radius,
      cursor: isOff ? 'not-allowed' : 'pointer',
      opacity: isOff ? 0.5 : 1,
      transition: 'transform var(--dur-fast) var(--ease-out), background var(--dur-base), opacity var(--dur-base)',
      WebkitTapHighlightColor: 'transparent',
      ...v,
      ...style
    },
    onMouseDown: e => {
      if (!isOff) e.currentTarget.style.transform = 'scale(0.97)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), loading ? /*#__PURE__*/React.createElement(Spinner, null) : leadingIcon, children, !loading && trailingIcon);
}
function Spinner() {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: 15,
      height: 15,
      borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.35)',
      borderTopColor: '#fff',
      display: 'inline-block',
      animation: 'mp-spin 0.7s linear infinite'
    }
  });
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Square icon button — used in headers, list rows, toolbars.
 * Pass an SVG / icon node as children.
 */
function IconButton({
  children,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  label,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: 32,
    md: 40,
    lg: 48
  };
  const dim = sizes[size] || sizes.md;
  const variants = {
    ghost: {
      background: 'transparent',
      color: 'var(--c-muted)',
      border: '1px solid transparent'
    },
    soft: {
      background: 'var(--c-input)',
      color: 'var(--c-text)',
      border: '1px solid var(--c-border)'
    },
    solid: {
      background: 'var(--c-primary)',
      color: '#fff',
      border: '1px solid transparent'
    }
  };
  const v = variants[variant] || variants.ghost;
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    disabled: disabled,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: dim,
      height: dim,
      borderRadius: 'var(--radius-md)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      transition: 'transform var(--dur-fast) var(--ease-out), background var(--dur-base), color var(--dur-base)',
      WebkitTapHighlightColor: 'transparent',
      ...v,
      ...style
    },
    onMouseEnter: e => {
      if (!disabled && variant === 'ghost') e.currentTarget.style.color = 'var(--c-text)';
      e.currentTarget.style.transform = disabled ? 'none' : 'scale(1.06)';
    },
    onMouseLeave: e => {
      if (variant === 'ghost') e.currentTarget.style.color = 'var(--c-muted)';
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/VerifiedBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Standalone blue verified tick (matches the one in Avatar). */
function VerifiedBadge({
  size = 18,
  style = {},
  title = 'Verified',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    role: "img",
    "aria-label": title,
    style: {
      display: 'inline-block',
      verticalAlign: 'middle',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("path", {
    d: "M12 2l2.4 1.7 2.9-.3 1.2 2.7 2.6 1.4-.6 2.9 1.5 2.5-2 2.1.1 2.9-2.8.8L15.6 22 12 20.6 8.4 22l-1.4-2.4-2.8-.8.1-2.9-2-2.1L3.8 11l-.6-2.9 2.6-1.4 1.2-2.7 2.9.3L12 2z",
    fill: "var(--c-blue-accent)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 12.2l2.3 2.3 4.6-4.8",
    stroke: "#fff",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
Object.assign(__ds_scope, { VerifiedBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/VerifiedBadge.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Text input with label, helper text, and validation state.
 * States drive the border color and helper tint.
 */
function Input({
  label,
  helper,
  state = 'idle',
  // idle | checking | valid | invalid
  prefix,
  suffix,
  value,
  style = {},
  inputStyle = {},
  ...rest
}) {
  const ring = {
    idle: 'var(--c-border)',
    checking: 'var(--c-border-strong)',
    valid: 'var(--c-success)',
    invalid: 'var(--c-error)'
  }[state] || 'var(--c-border)';
  const helperColor = {
    idle: 'var(--c-muted)',
    checking: 'var(--c-muted)',
    valid: 'var(--c-success)',
    invalid: 'var(--c-error)'
  }[state] || 'var(--c-muted)';
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--c-text)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: 48,
      padding: '0 14px',
      background: 'var(--c-input)',
      border: `1.5px solid ${ring}`,
      borderRadius: 'var(--radius-md)',
      transition: 'border-color var(--dur-base)'
    }
  }, prefix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--c-muted)',
      fontSize: 15,
      display: 'inline-flex'
    }
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    value: value,
    style: {
      flex: 1,
      minWidth: 0,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      color: 'var(--c-text)',
      fontFamily: 'var(--font-sans)',
      fontSize: 15,
      ...inputStyle
    }
  }, rest)), state === 'checking' && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 15,
      height: 15,
      borderRadius: '50%',
      border: '2px solid var(--c-border-strong)',
      borderTopColor: 'var(--c-muted)',
      animation: 'mp-spin 0.7s linear infinite'
    }
  }), state === 'valid' && /*#__PURE__*/React.createElement(Tick, {
    color: "var(--c-success)"
  }), state === 'invalid' && /*#__PURE__*/React.createElement(Cross, {
    color: "var(--c-error)"
  }), suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--c-muted)',
      fontSize: 14
    }
  }, suffix)), helper && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: helperColor
    }
  }, helper));
}
function Tick({
  color
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 12.5l4 4 10-10",
    stroke: color,
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }));
}
function Cross({
  color
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 6l12 12M18 6L6 18",
    stroke: color,
    strokeWidth: "2.4",
    strokeLinecap: "round"
  }));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/PinDots.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** 6-dot (configurable) PIN progress indicator, with error shake. */
function PinDots({
  length = 6,
  filled = 0,
  error = false,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      gap: 14,
      justifyContent: 'center',
      animation: error ? 'mp-shake 0.4s var(--ease-in-out)' : 'none',
      ...style
    }
  }, rest), Array.from({
    length
  }).map((_, i) => {
    const on = i < filled;
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: error ? 'var(--c-error)' : on ? 'var(--c-primary)' : 'transparent',
        border: `2px solid ${error ? 'var(--c-error)' : on ? 'var(--c-primary)' : 'var(--c-border-strong)'}`,
        boxShadow: on && !error ? '0 0 12px rgba(47,107,255,0.6)' : 'none',
        transition: 'background var(--dur-fast), border-color var(--dur-fast)'
      }
    });
  }));
}
Object.assign(__ds_scope, { PinDots });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/PinDots.jsx", error: String((e && e.message) || e) }); }

// components/product/MironScoreCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Miron Score widget — score, level, streak, XP progress to next level. */
function MironScoreCard({
  score = 0,
  level = 'Newcomer',
  streak = 0,
  xp = 0,
  xpMax = 100,
  style = {},
  ...rest
}) {
  const pct = Math.max(0, Math.min(100, xp / xpMax * 100));
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      padding: 20,
      borderRadius: 'var(--radius-lg)',
      background: 'var(--grad-score)',
      border: '1px solid var(--glass-border)',
      backdropFilter: 'blur(var(--glass-blur))',
      WebkitBackdropFilter: 'blur(var(--glass-blur))',
      boxShadow: 'inset 0 1px 0 var(--glass-hi)',
      fontFamily: 'var(--font-sans)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--c-purple-accent)',
      textTransform: 'uppercase',
      letterSpacing: '0.06em'
    }
  }, "Miron Score"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 38,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: 'var(--c-text)',
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 1.1
    }
  }, score), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--c-muted)',
      fontWeight: 500
    }
  }, level)), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 11px',
      borderRadius: 'var(--radius-full)',
      background: 'rgba(245,158,11,0.16)',
      color: 'var(--c-warning)',
      fontSize: 12.5,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, "\uD83D\uDD25"), " ", streak, " day", streak === 1 ? '' : 's')), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 11.5,
      color: 'var(--c-muted)',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", null, xp, " XP"), /*#__PURE__*/React.createElement("span", null, xpMax, " XP")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      borderRadius: 'var(--radius-full)',
      background: 'var(--c-input)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${pct}%`,
      height: '100%',
      borderRadius: 'var(--radius-full)',
      background: 'linear-gradient(90deg,#5b8cff,#2f6bff)'
    }
  }))));
}
Object.assign(__ds_scope, { MironScoreCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/product/MironScoreCard.jsx", error: String((e && e.message) || e) }); }

// components/product/NavItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Sidebar / bottom-bar navigation item. Active = purple, disabled = dimmed. */
function NavItem({
  icon,
  label,
  active = false,
  disabled = false,
  orientation = 'horizontal',
  // horizontal (sidebar) | vertical (bottom bar)
  onClick,
  style = {},
  ...rest
}) {
  const vertical = orientation === 'vertical';
  const color = disabled ? 'var(--c-muted2)' : active ? 'var(--c-primary)' : 'var(--c-muted)';
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: disabled ? undefined : onClick,
    "aria-current": active ? 'page' : undefined,
    style: {
      display: 'flex',
      flexDirection: vertical ? 'column' : 'row',
      alignItems: 'center',
      gap: vertical ? 3 : 11,
      justifyContent: vertical ? 'center' : 'flex-start',
      width: vertical ? 'auto' : '100%',
      padding: vertical ? '6px 10px' : '10px 12px',
      borderRadius: 'var(--radius-md)',
      background: active && !vertical ? 'var(--c-input)' : 'transparent',
      border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.25 : 1,
      color,
      fontFamily: 'var(--font-sans)',
      fontSize: vertical ? 10.5 : 14,
      fontWeight: active ? 600 : 500,
      transition: 'background var(--dur-fast), color var(--dur-fast)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    },
    onMouseEnter: e => {
      if (!disabled && !active && !vertical) e.currentTarget.style.background = 'var(--c-input)';
    },
    onMouseLeave: e => {
      if (!active && !vertical) e.currentTarget.style.background = 'transparent';
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      width: vertical ? 22 : 20,
      height: vertical ? 22 : 20
    }
  }, icon), label);
}
Object.assign(__ds_scope, { NavItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/product/NavItem.jsx", error: String((e && e.message) || e) }); }

// components/product/QuickAction.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Round icon + label tile for the dashboard quick-actions row. */
function QuickAction({
  icon,
  label,
  onClick,
  accent = 'var(--c-primary)',
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    },
    onMouseEnter: e => {
      const c = e.currentTarget.firstChild;
      if (c) c.style.transform = 'scale(1.08)';
    },
    onMouseLeave: e => {
      const c = e.currentTarget.firstChild;
      if (c) c.style.transform = 'scale(1)';
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 52,
      height: 52,
      borderRadius: 'var(--radius-md)',
      background: 'var(--c-panel-2)',
      border: '1px solid var(--c-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: accent,
      transition: 'transform var(--dur-fast) var(--ease-out)'
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--c-muted)'
    }
  }, label));
}
Object.assign(__ds_scope, { QuickAction });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/product/QuickAction.jsx", error: String((e && e.message) || e) }); }

// components/product/TokenRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** A token holdings list row: logo · symbol/name · balance · price + 24h change. */
function TokenRow({
  symbol,
  name,
  logo,
  balance,
  fiat,
  change,
  // number — % 24h, sign drives color
  style = {},
  ...rest
}) {
  const up = (change ?? 0) >= 0;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 14px',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
      transition: 'background var(--dur-fast)',
      fontFamily: 'var(--font-sans)',
      ...style
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = 'var(--c-input)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      borderRadius: '50%',
      background: 'var(--c-panel-2)',
      border: '1px solid var(--c-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: 13,
      color: 'var(--c-text)',
      overflow: 'hidden',
      flexShrink: 0
    }
  }, logo ? /*#__PURE__*/React.createElement("img", {
    src: logo,
    alt: "",
    width: 38,
    height: 38
  }) : symbol?.slice(0, 2)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--c-text)'
    }
  }, symbol), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--c-muted)'
    }
  }, name)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--c-text)',
      fontVariantNumeric: 'tabular-nums'
    }
  }, balance), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: up ? 'var(--c-success)' : 'var(--c-error)',
      fontWeight: 500
    }
  }, fiat && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--c-muted)',
      marginRight: 6
    }
  }, fiat), change != null && `${up ? '+' : ''}${change}%`)));
}
Object.assign(__ds_scope, { TokenRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/product/TokenRow.jsx", error: String((e && e.message) || e) }); }

// components/product/WalletCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const VARIANTS = {
  blue: {
    accent: 'var(--c-wallet-blue)',
    glow: 'var(--glow-blue)',
    label: 'Main Wallet'
  },
  purple: {
    accent: 'var(--c-wallet-purple)',
    glow: 'var(--glow-purple)',
    label: 'Agent AI'
  },
  cyan: {
    accent: 'var(--c-wallet-cyan)',
    glow: 'var(--glow-cyan)',
    label: 'Status'
  }
};

/**
 * Wallet card with colored accent border + glow, hover-lift.
 * Children render in the card footer (sparkline, limit bar, etc.).
 */
function WalletCard({
  variant = 'blue',
  label,
  balance,
  symbol = 'USDC',
  address,
  children,
  style = {},
  ...rest
}) {
  const v = VARIANTS[variant] || VARIANTS.blue;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: 'relative',
      minWidth: 220,
      padding: 20,
      borderRadius: 'var(--radius-lg)',
      background: `linear-gradient(150deg, color-mix(in srgb, ${v.accent} 18%, transparent), transparent 58%), var(--glass-bg)`,
      backdropFilter: 'blur(var(--glass-blur))',
      WebkitBackdropFilter: 'blur(var(--glass-blur))',
      border: '1px solid var(--glass-border)',
      boxShadow: `${v.glow}, inset 0 1px 0 var(--glass-hi)`,
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base)',
      ...style
    },
    onMouseEnter: e => {
      e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'none';
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -40,
      right: -40,
      width: 120,
      height: 120,
      borderRadius: '50%',
      background: v.accent,
      opacity: 0.18,
      filter: 'blur(28px)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--c-muted)'
    }
  }, label || v.label), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: v.accent,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 12,
      fontWeight: 700
    }
  }, symbol.slice(0, 1))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 30,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      fontVariantNumeric: 'tabular-nums',
      color: 'var(--c-text)'
    }
  }, balance, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: 'var(--c-muted)'
    }
  }, symbol)), address && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--c-muted2)'
    }
  }, address), children && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, children));
}
Object.assign(__ds_scope, { WalletCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/product/WalletCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mironpay-app/AgentScreen.jsx
try { (() => {
// Agent — AI chat. Messages, per-message USDC cost, inline TxResultCard,
// typing indicator, input bar. Demo: typing "send 5 USDC to @bea" triggers a tx.
function AgentScreen({
  onBack,
  onNeedPin
}) {
  const DS = window.MironPayDesignSystem_577c4b;
  const {
    Avatar,
    Badge
  } = DS;
  const I = window.Icons;
  const [msgs, setMsgs] = React.useState([{
    role: 'assistant',
    text: "Hi @miron_alex 👋 I'm your MironPay agent. I can send, swap, or check balances on-chain. Try \"send 5 USDC to @bea\".",
    cost: '0.002'
  }]);
  const [draft, setDraft] = React.useState('');
  const [typing, setTyping] = React.useState(false);
  const scroller = React.useRef(null);
  React.useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [msgs, typing]);
  const send = text => {
    const t = (text ?? draft).trim();
    if (!t) return;
    setMsgs(m => [...m, {
      role: 'user',
      text: t
    }]);
    setDraft('');
    setTyping(true);
    const isTx = /send|pay|transfer/i.test(t);
    setTimeout(() => {
      setTyping(false);
      if (isTx) {
        setMsgs(m => [...m, {
          role: 'assistant',
          text: 'Ready to send 5.00 USDC to @bea_k. Confirm with your PIN to execute on-chain.',
          cost: '0.004'
        }]);
        onNeedPin(() => {
          setMsgs(m => [...m, {
            role: 'assistant',
            tx: {
              to: '@bea_k',
              amt: '5.00 USDC',
              hash: '0xab12…ff09'
            },
            cost: '0.006'
          }]);
        });
      } else {
        setMsgs(m => [...m, {
          role: 'assistant',
          text: 'Your Main Wallet holds 2,480.55 USDC and your Agent Wallet has 64.20 USDC available today.',
          cost: '0.003'
        }]);
      }
    }, 1300);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--c-page)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      padding: '16px 18px',
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(var(--glass-blur))',
      WebkitBackdropFilter: 'blur(var(--glass-blur))',
      borderBottom: '1px solid var(--glass-border)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      borderRadius: '50%',
      background: 'linear-gradient(135deg,#5b8cff,#3b30c4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement(I.agent, {
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 600,
      color: 'var(--c-text)'
    }
  }, "Miron Agent"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--c-success)',
      display: 'flex',
      alignItems: 'center',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--c-success)'
    }
  }), " Online \xB7 on-chain ready"))), /*#__PURE__*/React.createElement("div", {
    ref: scroller,
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, msgs.map((m, i) => /*#__PURE__*/React.createElement(Message, {
    key: i,
    m: m,
    I: I
  })), typing && /*#__PURE__*/React.createElement(Typing, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: '0 18px 10px',
      overflowX: 'auto',
      scrollbarWidth: 'none'
    }
  }, ['Send 5 USDC to @bea', "What's my balance?", 'Swap 20 USDC → ETH'].map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    onClick: () => send(s),
    style: {
      whiteSpace: 'nowrap',
      padding: '7px 13px',
      borderRadius: 9999,
      border: '1px solid var(--c-border-strong)',
      background: 'var(--c-input)',
      color: 'var(--c-muted)',
      fontSize: 12.5,
      fontWeight: 500,
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)'
    }
  }, s))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 16px 18px',
      borderTop: '1px solid var(--c-border)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: draft,
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => e.key === 'Enter' && send(),
    placeholder: "Ask your agent\u2026",
    style: {
      flex: 1,
      height: 46,
      padding: '0 16px',
      borderRadius: 9999,
      border: '1px solid var(--glass-border)',
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(var(--glass-blur))',
      WebkitBackdropFilter: 'blur(var(--glass-blur))',
      color: 'var(--c-text)',
      fontSize: 15,
      fontFamily: 'var(--font-sans)',
      outline: 'none'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => send(),
    style: {
      width: 46,
      height: 46,
      borderRadius: '50%',
      border: 'none',
      background: 'var(--c-primary)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      boxShadow: 'var(--glow-primary)'
    }
  }, /*#__PURE__*/React.createElement(I.send, {
    size: 20
  }))));
}
function Message({
  m,
  I
}) {
  const user = m.role === 'user';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: user ? 'flex-end' : 'flex-start',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '82%',
      padding: '11px 14px',
      borderRadius: 16,
      borderBottomRightRadius: user ? 4 : 16,
      borderBottomLeftRadius: user ? 16 : 4,
      background: user ? 'var(--grad-primary)' : 'var(--glass-bg)',
      backdropFilter: user ? 'none' : 'blur(var(--glass-blur))',
      WebkitBackdropFilter: user ? 'none' : 'blur(var(--glass-blur))',
      color: user ? '#fff' : 'var(--c-text)',
      border: user ? 'none' : '1px solid var(--glass-border)',
      boxShadow: user ? 'var(--glow-primary)' : 'inset 0 1px 0 var(--glass-hi)',
      fontSize: 14.5,
      lineHeight: 1.5
    }
  }, m.tx ? /*#__PURE__*/React.createElement(TxResult, {
    tx: m.tx,
    I: I
  }) : m.text), !user && m.cost && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: 'var(--c-muted2)',
      fontFamily: 'var(--font-mono)'
    }
  }, "cost ", m.cost, " USDC"));
}
function TxResult({
  tx,
  I
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 200
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
      color: 'var(--c-success)',
      fontWeight: 600,
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: '50%',
      background: 'rgba(34,197,94,0.18)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(I.check, {
    size: 14
  })), "Transaction sent"), /*#__PURE__*/React.createElement(Row, {
    k: "Amount",
    v: tx.amt
  }), /*#__PURE__*/React.createElement(Row, {
    k: "To",
    v: tx.to
  }), /*#__PURE__*/React.createElement(Row, {
    k: "Tx hash",
    v: tx.hash,
    mono: true,
    link: true
  }));
}
function Row({
  k,
  v,
  mono,
  link
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 13,
      padding: '3px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--c-muted)'
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      color: link ? 'var(--c-blue-accent)' : 'var(--c-text)',
      fontFamily: mono ? 'var(--font-mono)' : 'inherit',
      fontWeight: 500
    }
  }, v));
}
function Typing() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 5,
      padding: '12px 16px',
      background: 'var(--c-panel)',
      border: '1px solid var(--c-border)',
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      width: 'fit-content'
    }
  }, [0, 1, 2].map(i => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'var(--c-muted)',
      animation: `mp-pulse 1s ${i * 0.16}s infinite`
    }
  })));
}
window.AgentScreen = AgentScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mironpay-app/AgentScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mironpay-app/DashboardScreen.jsx
try { (() => {
// Dashboard — the main hub. Header, wallet cards, quick actions, Miron Score,
// recent transactions, token holdings.
function DashboardScreen({
  onNav,
  theme,
  onToggleTheme
}) {
  const DS = window.MironPayDesignSystem_577c4b;
  const {
    WalletCard,
    QuickAction,
    MironScoreCard,
    TokenRow,
    Avatar,
    IconButton
  } = DS;
  const I = window.Icons;
  const txs = [{
    who: 'Sent to @bea_k',
    sub: 'Today · 2:14 PM',
    amt: '-25.00',
    up: false
  }, {
    who: 'Received from @tomr',
    sub: 'Today · 9:02 AM',
    amt: '+120.00',
    up: true
  }, {
    who: 'Swap USDC → ETH',
    sub: 'Yesterday',
    amt: '-50.00',
    up: false
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      overflowY: 'auto',
      background: 'var(--c-page)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 18px 90px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "@miron_alex",
    size: 42,
    verified: true
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--c-muted)'
    }
  }, "Welcome back"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--c-text)'
    }
  }, "@miron_alex"))), /*#__PURE__*/React.createElement(IconButton, {
    variant: "soft",
    label: "theme",
    onClick: onToggleTheme
  }, theme === 'dark' ? /*#__PURE__*/React.createElement(I.sun, {
    size: 20
  }) : /*#__PURE__*/React.createElement(I.moon, {
    size: 20
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      padding: '22px 22px 20px',
      borderRadius: 'var(--radius-lg)',
      marginBottom: 22,
      overflow: 'hidden',
      background: 'linear-gradient(150deg, rgba(47,107,255,0.20), rgba(109,108,255,0.05) 55%), var(--glass-bg)',
      backdropFilter: 'blur(var(--glass-blur))',
      WebkitBackdropFilter: 'blur(var(--glass-blur))',
      border: '1px solid var(--glass-border)',
      boxShadow: 'var(--glow-blue), inset 0 1px 0 var(--glass-hi)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      fontWeight: 500,
      color: 'var(--c-muted)',
      letterSpacing: '0.02em'
    }
  }, "Total balance"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 10,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 42,
      fontWeight: 600,
      letterSpacing: '-0.03em',
      color: 'var(--c-text)',
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 1
    }
  }, "$3,794", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 24,
      color: 'var(--c-muted)'
    }
  }, ".75")), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 9px',
      borderRadius: 'var(--radius-full)',
      background: 'rgba(43,212,164,0.16)',
      color: 'var(--c-success)',
      fontSize: 12.5,
      fontWeight: 600,
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement(I.receive, {
    size: 13
  }), " +5.2%")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--c-muted2)',
      marginTop: 8,
      fontFamily: 'var(--font-mono)'
    }
  }, "Across 3 wallets \xB7 ARC network")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      margin: '0 4px 10px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 13.5,
      fontWeight: 600,
      color: 'var(--c-muted)',
      margin: 0,
      textTransform: 'uppercase',
      letterSpacing: '0.06em'
    }
  }, "Your wallets")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      overflowX: 'auto',
      margin: '0 -18px 22px',
      padding: '0 18px 4px',
      scrollbarWidth: 'none'
    }
  }, /*#__PURE__*/React.createElement(WalletCard, {
    variant: "blue",
    balance: "2,480.55",
    address: "0x7a3f\u20269C2e",
    style: {
      minWidth: 230
    }
  }, /*#__PURE__*/React.createElement(Sparkline, {
    color: "#5b8cff"
  })), /*#__PURE__*/React.createElement(WalletCard, {
    variant: "purple",
    label: "Agent AI",
    balance: "64.20",
    style: {
      minWidth: 230
    }
  }, /*#__PURE__*/React.createElement(LimitBar, {
    spent: 120,
    limit: 500
  })), /*#__PURE__*/React.createElement(WalletCard, {
    variant: "cyan",
    label: "Status",
    symbol: "STS",
    balance: "1,250",
    style: {
      minWidth: 200
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '0 6px',
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement(QuickAction, {
    icon: /*#__PURE__*/React.createElement(I.send, {
      size: 22
    }),
    label: "Send",
    onClick: () => onNav('send')
  }), /*#__PURE__*/React.createElement(QuickAction, {
    icon: /*#__PURE__*/React.createElement(I.receive, {
      size: 22
    }),
    label: "Receive",
    accent: "var(--c-success)",
    onClick: () => onNav('receive')
  }), /*#__PURE__*/React.createElement(QuickAction, {
    icon: /*#__PURE__*/React.createElement(I.swap, {
      size: 22
    }),
    label: "Swap",
    accent: "var(--c-blue-accent)",
    onClick: () => onNav('swap')
  }), /*#__PURE__*/React.createElement(QuickAction, {
    icon: /*#__PURE__*/React.createElement(I.plus, {
      size: 22
    }),
    label: "Top Up",
    accent: "var(--c-purple-accent)",
    onClick: () => onNav('topup')
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement(MironScoreCard, {
    score: 420,
    level: "Trusted",
    streak: 7,
    xp: 64,
    xpMax: 100
  })), /*#__PURE__*/React.createElement(SectionHead, {
    title: "Recent activity",
    action: "View all"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(var(--glass-blur))',
      WebkitBackdropFilter: 'blur(var(--glass-blur))',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--glass-border)',
      boxShadow: 'inset 0 1px 0 var(--glass-hi)',
      padding: 6,
      marginBottom: 22
    }
  }, txs.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '11px 12px',
      borderBottom: i < txs.length - 1 ? '1px solid var(--c-border)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      borderRadius: '50%',
      background: t.up ? 'rgba(34,197,94,0.14)' : 'var(--c-input)',
      color: t.up ? 'var(--c-success)' : 'var(--c-muted)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, t.up ? /*#__PURE__*/React.createElement(I.receive, {
    size: 18
  }) : /*#__PURE__*/React.createElement(I.send, {
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--c-text)'
    }
  }, t.who), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--c-muted)'
    }
  }, t.sub)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14.5,
      fontWeight: 600,
      fontVariantNumeric: 'tabular-nums',
      color: t.up ? 'var(--c-success)' : 'var(--c-text)'
    }
  }, t.amt)))), /*#__PURE__*/React.createElement(SectionHead, {
    title: "Holdings"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(var(--glass-blur))',
      WebkitBackdropFilter: 'blur(var(--glass-blur))',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--glass-border)',
      boxShadow: 'inset 0 1px 0 var(--glass-hi)',
      padding: 6
    }
  }, /*#__PURE__*/React.createElement(TokenRow, {
    symbol: "USDC",
    name: "USD Coin",
    balance: "2,480.55",
    fiat: "$2,480",
    change: 0.0
  }), /*#__PURE__*/React.createElement(TokenRow, {
    symbol: "ETH",
    name: "Ethereum",
    balance: "0.84",
    fiat: "$2,910",
    change: -2.4
  }), /*#__PURE__*/React.createElement(TokenRow, {
    symbol: "BTC",
    name: "Bitcoin (bridged)",
    balance: "0.012",
    fiat: "$780",
    change: 1.6
  }))));
}
function SectionHead({
  title,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      margin: '0 4px 10px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: 'var(--c-text)',
      margin: 0
    }
  }, title), action && /*#__PURE__*/React.createElement("button", {
    style: {
      background: 'none',
      border: 'none',
      color: 'var(--c-purple-accent)',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)'
    }
  }, action));
}
function Sparkline({
  color
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: "100%",
    height: "34",
    viewBox: "0 0 200 34",
    preserveAspectRatio: "none",
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: 'sg' + color,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: color,
    stopOpacity: "0.35"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: color,
    stopOpacity: "0"
  }))), /*#__PURE__*/React.createElement("path", {
    d: "M0 26 L25 22 L50 24 L75 14 L100 18 L125 8 L150 12 L175 5 L200 9",
    fill: "none",
    stroke: color,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M0 26 L25 22 L50 24 L75 14 L100 18 L125 8 L150 12 L175 5 L200 9 L200 34 L0 34 Z",
    fill: 'url(#sg' + color + ')'
  }));
}
function LimitBar({
  spent,
  limit
}) {
  const pct = Math.min(100, spent / limit * 100);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 11.5,
      color: 'var(--c-muted)',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", null, "Daily spent"), /*#__PURE__*/React.createElement("span", null, "$", spent, " / $", limit)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 7,
      borderRadius: 9999,
      background: 'var(--c-input)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: pct + '%',
      height: '100%',
      borderRadius: 9999,
      background: 'linear-gradient(90deg,#6d6cff,#2f6bff)'
    }
  })));
}
window.DashboardScreen = DashboardScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mironpay-app/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mironpay-app/LoginScreen.jsx
try { (() => {
// Login — centered card, brand mark, single Google CTA. States: idle/loading/error.
function LoginScreen({
  onLogin
}) {
  const DS = window.MironPayDesignSystem_577c4b;
  const {
    Button
  } = DS;
  const I = window.Icons;
  const [phase, setPhase] = React.useState('idle');
  const go = () => {
    setPhase('loading');
    setTimeout(() => onLogin(), 1100);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '0 28px',
      textAlign: 'center',
      background: 'radial-gradient(120% 80% at 50% -5%, rgba(47,107,255,0.22), transparent 58%), radial-gradient(90% 60% at 50% 105%, rgba(34,198,224,0.10), transparent 60%), var(--c-page)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: "72",
    height: "72",
    alt: "MironPay",
    style: {
      marginBottom: 22,
      filter: 'drop-shadow(0 8px 24px rgba(47,107,255,0.55))'
    }
  }), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 28,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      margin: '0 0 8px',
      color: 'var(--c-text)'
    }
  }, "Miron", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--c-purple-accent)'
    }
  }, "Pay")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      color: 'var(--c-muted)',
      margin: '0 0 36px',
      lineHeight: 1.5,
      maxWidth: 260
    }
  }, "Send stablecoins as easily as a text. Your wallet, your AI agent, on-chain."), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    fullWidth: true,
    onClick: go,
    loading: phase === 'loading',
    leadingIcon: phase === 'loading' ? null : /*#__PURE__*/React.createElement(I.google, null),
    style: {
      background: '#fff',
      color: '#1f2430',
      borderColor: 'transparent',
      maxWidth: 320
    }
  }, phase === 'loading' ? 'Redirecting…' : 'Sign in with Google'), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--c-muted2)',
      marginTop: 22,
      maxWidth: 260,
      lineHeight: 1.5
    }
  }, "By continuing you agree to the Terms & Privacy Policy."));
}
window.LoginScreen = LoginScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mironpay-app/LoginScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mironpay-app/PinModal.jsx
try { (() => {
// Shared PIN sheet — slides up from bottom, numpad + dots, shake on wrong PIN.
function PinModal({
  open,
  title = 'Enter your PIN',
  onSuccess,
  onClose,
  correct = '123456'
}) {
  const DS = window.MironPayDesignSystem_577c4b;
  const {
    PinDots
  } = DS;
  const I = window.Icons;
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setPin('');
      setError(false);
    }
  }, [open]);
  const press = n => {
    if (pin.length >= 6) return;
    const next = pin + n;
    setPin(next);
    if (next.length === 6) {
      setTimeout(() => {
        if (next === correct) {
          onSuccess && onSuccess();
        } else {
          setError(true);
          setTimeout(() => {
            setPin('');
            setError(false);
          }, 650);
        }
      }, 180);
    }
  };
  const del = () => setPin(p => p.slice(0, -1));
  if (!open) return null;
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--c-overlay)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'flex-end',
      zIndex: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: '100%',
      background: 'var(--c-panel)',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: '22px 22px 30px',
      borderTop: '1px solid var(--c-border-strong)',
      animation: 'mp-slideup 0.28s var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 4,
      borderRadius: 2,
      background: 'var(--c-border-strong)',
      margin: '0 auto 18px'
    }
  }), /*#__PURE__*/React.createElement("h3", {
    style: {
      textAlign: 'center',
      fontSize: 17,
      fontWeight: 600,
      margin: '0 0 4px',
      color: 'var(--c-text)'
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: 'center',
      fontSize: 13,
      color: error ? 'var(--c-error)' : 'var(--c-muted)',
      margin: '0 0 22px',
      minHeight: 18
    }
  }, error ? 'Incorrect PIN, try again' : 'Confirm to authorize this transaction'), /*#__PURE__*/React.createElement(PinDots, {
    filled: pin.length,
    error: error,
    style: {
      marginBottom: 26
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 10,
      maxWidth: 280,
      margin: '0 auto'
    }
  }, keys.map((k, i) => k === '' ? /*#__PURE__*/React.createElement("div", {
    key: i
  }) : /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: () => k === 'del' ? del() : press(k),
    style: {
      height: 58,
      borderRadius: 16,
      border: '1px solid var(--c-border)',
      background: 'var(--c-input)',
      color: 'var(--c-text)',
      fontFamily: 'var(--font-sans)',
      fontSize: 22,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      WebkitTapHighlightColor: 'transparent'
    }
  }, k === 'del' ? /*#__PURE__*/React.createElement(I.arrowLeft, {
    size: 22
  }) : k))), /*#__PURE__*/React.createElement("p", {
    style: {
      textAlign: 'center',
      fontSize: 11.5,
      color: 'var(--c-muted2)',
      marginTop: 18
    }
  }, "Demo PIN \u2014 123456")));
}
window.PinModal = PinModal;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mironpay-app/PinModal.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mironpay-app/ReceiveScreen.jsx
try { (() => {
// Receive — QR of the wallet address, copyable address, token selector.
// (Real app uses qrcode.react; here the QR is a representative module grid.)
function ReceiveScreen({
  onBack
}) {
  const DS = window.MironPayDesignSystem_577c4b;
  const {
    Button,
    Badge
  } = DS;
  const I = window.Icons;
  const Header = window.ScreenHeader;
  const [copied, setCopied] = React.useState(false);
  const addr = '0x7a3f9C2e4Bd1aF08b612cc90Ee37';
  const copy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--c-page)'
    }
  }, /*#__PURE__*/React.createElement(Header, {
    title: "Receive USDC",
    onBack: onBack,
    I: I
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "info",
    dot: true
  }, "ARC Network \xB7 Circle"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      padding: 18,
      borderRadius: 20,
      boxShadow: 'var(--shadow-lg)'
    }
  }, /*#__PURE__*/React.createElement(QrMock, {
    seed: addr
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--c-muted)',
      textAlign: 'center',
      margin: 0,
      maxWidth: 260,
      lineHeight: 1.5
    }
  }, "Scan to send USDC to ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--c-text)'
    }
  }, "@miron_alex")), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: 'var(--c-panel)',
      border: '1px solid var(--c-border)',
      borderRadius: 14,
      padding: '13px 15px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      color: 'var(--c-text)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, addr), /*#__PURE__*/React.createElement("button", {
    onClick: copy,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '7px 12px',
      borderRadius: 10,
      border: 'none',
      background: copied ? 'rgba(34,197,94,0.16)' : 'var(--c-input)',
      color: copied ? 'var(--c-success)' : 'var(--c-purple-accent)',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)'
    }
  }, copied ? /*#__PURE__*/React.createElement(I.check, {
    size: 15
  }) : /*#__PURE__*/React.createElement(I.copy, {
    size: 15
  }), copied ? 'Copied' : 'Copy'))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 18px 22px',
      borderTop: '1px solid var(--c-border)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    fullWidth: true,
    onClick: onBack
  }, "Done")));
}

// Deterministic module grid that reads as a QR for mock purposes.
function QrMock({
  seed
}) {
  const n = 21;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = h * 131 + seed.charCodeAt(i) >>> 0;
  const rand = () => {
    h = h * 1103515245 + 12345 & 0x7fffffff;
    return h / 0x7fffffff;
  };
  const cells = [];
  const finder = (r, c) => r < 7 && c < 7 || r < 7 && c > n - 8 || r > n - 8 && c < 7;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (finder(r, c)) continue;
    if (rand() > 0.52) cells.push(/*#__PURE__*/React.createElement("rect", {
      key: r + '-' + c,
      x: c * 8,
      y: r * 8,
      width: "8",
      height: "8",
      fill: "#0a0718"
    }));
  }
  const Finder = ({
    x,
    y
  }) => /*#__PURE__*/React.createElement("g", {
    transform: `translate(${x} ${y})`
  }, /*#__PURE__*/React.createElement("rect", {
    width: "56",
    height: "56",
    fill: "#0a0718"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "8",
    y: "8",
    width: "40",
    height: "40",
    fill: "#fff"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "16",
    y: "16",
    width: "24",
    height: "24",
    fill: "#0a0718"
  }));
  return /*#__PURE__*/React.createElement("svg", {
    width: "168",
    height: "168",
    viewBox: "0 0 168 168",
    shapeRendering: "crispEdges"
  }, cells, /*#__PURE__*/React.createElement(Finder, {
    x: 0,
    y: 0
  }), /*#__PURE__*/React.createElement(Finder, {
    x: 112,
    y: 0
  }), /*#__PURE__*/React.createElement(Finder, {
    x: 0,
    y: 112
  }));
}
window.ReceiveScreen = ReceiveScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mironpay-app/ReceiveScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mironpay-app/SendScreen.jsx
try { (() => {
// Send — recipient, token, amount, fee estimate, PIN confirm, then the
// 4-phase on-chain progress (Fund → Withdraw → Send → Deposit) and success.
function SendScreen({
  onBack,
  onNeedPin
}) {
  const DS = window.MironPayDesignSystem_577c4b;
  const {
    Button,
    Input
  } = DS;
  const I = window.Icons;
  const [recipient, setRecipient] = React.useState('@bea_k');
  const [amount, setAmount] = React.useState('25.00');
  const [view, setView] = React.useState('form'); // form | progress | done
  const [phase, setPhase] = React.useState(0);
  const phases = ['Fund Agent Wallet', 'Withdraw from Main', 'Send on-chain', 'Deposit to recipient'];
  const runProgress = () => {
    setView('progress');
    setPhase(0);
    let p = 0;
    const t = setInterval(() => {
      p += 1;
      setPhase(p);
      if (p >= phases.length) {
        clearInterval(t);
        setTimeout(() => setView('done'), 500);
      }
    }, 850);
  };
  const submit = () => onNeedPin(runProgress);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--c-page)'
    }
  }, /*#__PURE__*/React.createElement(Header, {
    title: "Send USDC",
    onBack: onBack,
    I: I
  }), view === 'form' && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Recipient",
    prefix: "@",
    value: recipient.replace('@', ''),
    onChange: e => setRecipient('@' + e.target.value),
    state: "valid",
    helper: "Bea Kim \xB7 verified"
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 7,
      color: 'var(--c-text)'
    }
  }, "Amount"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--c-panel)',
      border: '1px solid var(--c-border)',
      borderRadius: 16,
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 40,
      fontWeight: 700,
      color: 'var(--c-text)',
      letterSpacing: '-0.02em'
    }
  }, "$"), /*#__PURE__*/React.createElement("input", {
    value: amount,
    onChange: e => setAmount(e.target.value),
    inputMode: "decimal",
    style: {
      width: 150,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      color: 'var(--c-text)',
      fontSize: 40,
      fontWeight: 700,
      fontFamily: 'var(--font-sans)',
      letterSpacing: '-0.02em'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: '50%',
      background: '#2775ca',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 11,
      fontWeight: 700
    }
  }, "$"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--c-muted)'
    }
  }, "USDC"), /*#__PURE__*/React.createElement(I.chevron, {
    size: 16
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 10
    }
  }, ['10', '25', '50', '100'].map(q => /*#__PURE__*/React.createElement("button", {
    key: q,
    onClick: () => setAmount(q + '.00'),
    style: {
      flex: 1,
      height: 36,
      borderRadius: 10,
      border: '1px solid var(--c-border-strong)',
      background: 'var(--c-input)',
      color: 'var(--c-muted)',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)'
    }
  }, "$", q)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '0 4px',
      fontSize: 13.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--c-muted)'
    }
  }, "Network fee (est.)"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--c-text)',
      fontWeight: 500
    }
  }, "~$0.01"))), view === 'progress' && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: 28,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      textAlign: 'center',
      fontSize: 18,
      fontWeight: 600,
      margin: '0 0 8px',
      color: 'var(--c-text)'
    }
  }, "Sending ", amount, " USDC"), phases.map((p, i) => {
    const done = i < phase,
      active = i === phase;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        opacity: done || active ? 1 : 0.4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: done ? 'var(--c-success)' : active ? 'transparent' : 'var(--c-input)',
        border: active ? '2px solid var(--c-primary)' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        flexShrink: 0
      }
    }, done ? /*#__PURE__*/React.createElement(I.check, {
      size: 17
    }) : active ? /*#__PURE__*/React.createElement("span", {
      style: {
        width: 14,
        height: 14,
        borderRadius: '50%',
        border: '2px solid var(--c-primary)',
        borderTopColor: 'transparent',
        animation: 'mp-spin 0.7s linear infinite'
      }
    }) : /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: 'var(--c-muted2)'
      }
    }, i + 1)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 15,
        fontWeight: done || active ? 600 : 500,
        color: 'var(--c-text)'
      }
    }, p));
  })), view === 'done' && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: 28,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 76,
      height: 76,
      borderRadius: '50%',
      background: 'rgba(34,197,94,0.16)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--c-success)',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(I.check, {
    size: 40
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 24,
      fontWeight: 700,
      margin: 0,
      color: 'var(--c-text)'
    }
  }, "Sent!"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      color: 'var(--c-muted)',
      margin: '4px 0 0'
    }
  }, amount, " USDC to ", recipient), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      fontSize: 13,
      color: 'var(--c-blue-accent)',
      fontFamily: 'var(--font-mono)',
      marginTop: 8,
      textDecoration: 'none'
    }
  }, "0xab12\u2026ff09 \u2197")), view === 'form' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 18px 22px',
      borderTop: '1px solid var(--c-border)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    fullWidth: true,
    onClick: submit,
    leadingIcon: /*#__PURE__*/React.createElement(I.send, {
      size: 18
    })
  }, "Send ", amount, " USDC")), view === 'done' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 18px 22px'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg",
    fullWidth: true,
    onClick: onBack
  }, "Done")));
}
function Header({
  title,
  onBack,
  I
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '16px 18px',
      borderBottom: '1px solid var(--c-border)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      width: 38,
      height: 38,
      borderRadius: 12,
      border: '1px solid var(--c-border)',
      background: 'var(--c-input)',
      color: 'var(--c-text)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(I.arrowLeft, {
    size: 20
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 17,
      fontWeight: 600,
      margin: 0,
      color: 'var(--c-text)'
    }
  }, title));
}
window.SendScreen = SendScreen;
window.ScreenHeader = Header;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mironpay-app/SendScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mironpay-app/app.jsx
try { (() => {
// Harness: phone frame, auth gate, tab routing, shared PIN sheet.
function App() {
  const DS = window.MironPayDesignSystem_577c4b;
  const {
    NavItem
  } = DS;
  const I = window.Icons;
  const [authed, setAuthed] = React.useState(false);
  const [tab, setTab] = React.useState('agent'); // wallet | agent
  const [route, setRoute] = React.useState('agent'); // dashboard | send | receive | agent
  const [theme, setTheme] = React.useState('dark');
  const [pin, setPin] = React.useState({
    open: false,
    cb: null,
    title: 'Enter your PIN'
  });
  React.useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);
  const needPin = (cb, title) => setPin({
    open: true,
    cb,
    title: title || 'Enter your PIN'
  });
  const pinSuccess = () => {
    const cb = pin.cb;
    setPin({
      open: false,
      cb: null
    });
    cb && cb();
  };
  const goTab = t => {
    setTab(t);
    setRoute(t === 'agent' ? 'agent' : 'dashboard');
  };
  let screen;
  if (!authed) screen = /*#__PURE__*/React.createElement(window.LoginScreen, {
    onLogin: () => setAuthed(true)
  });else if (route === 'send') screen = /*#__PURE__*/React.createElement(window.SendScreen, {
    onBack: () => setRoute('dashboard'),
    onNeedPin: needPin
  });else if (route === 'receive') screen = /*#__PURE__*/React.createElement(window.ReceiveScreen, {
    onBack: () => setRoute('dashboard')
  });else if (route === 'agent') screen = /*#__PURE__*/React.createElement(window.AgentScreen, {
    onNeedPin: needPin
  });else screen = /*#__PURE__*/React.createElement(window.DashboardScreen, {
    onNav: r => setRoute(['send', 'receive'].includes(r) ? r : 'dashboard'),
    theme: theme,
    onToggleTheme: () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  });
  const showTabs = authed && (route === 'dashboard' || route === 'agent');
  const tabs = [{
    id: 'wallet',
    label: 'Wallet',
    icon: I.wallet,
    on: true
  }, {
    id: 'contacts',
    label: 'Contacts',
    icon: I.users,
    on: false
  }, {
    id: 'agent',
    label: 'Agent',
    icon: I.agent,
    on: true
  }, {
    id: 'board',
    label: 'Leaderboard',
    icon: I.trophy,
    on: false
  }, {
    id: 'settings',
    label: 'Settings',
    icon: I.settings,
    on: false
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "frame"
  }, /*#__PURE__*/React.createElement("div", {
    className: "notch"
  }), /*#__PURE__*/React.createElement("div", {
    className: "screen"
  }, screen, showTabs && /*#__PURE__*/React.createElement("div", {
    className: "tabbar"
  }, tabs.map(t => {
    const Ic = t.icon;
    return /*#__PURE__*/React.createElement(NavItem, {
      key: t.id,
      orientation: "vertical",
      icon: /*#__PURE__*/React.createElement(Ic, {
        size: 21
      }),
      label: t.label,
      active: t.on && tab === t.id,
      disabled: !t.on,
      onClick: () => t.on && goTab(t.id)
    });
  })), /*#__PURE__*/React.createElement(window.PinModal, {
    open: pin.open,
    title: pin.title,
    onSuccess: pinSuccess,
    onClose: () => setPin({
      open: false,
      cb: null
    })
  })));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mironpay-app/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mironpay-app/icons.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
// MironPay icon set — inline SVG, Lucide-style (1.9px stroke, round caps).
// The real app ships hand-written inline SVGs (no icon library); these match
// that stroke style. Substituted set is documented in the README ICONOGRAPHY section.
const Icon = ({
  d,
  fill,
  size = 22,
  ...rest
}) => /*#__PURE__*/React.createElement("svg", _extends({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: fill || 'none',
  stroke: fill ? 'none' : 'currentColor',
  strokeWidth: "1.9",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, rest), d);
const Icons = {
  wallet: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "6",
      width: "18",
      height: "13",
      rx: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M16 12.5h2.5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 9h14a1 1 0 011 1"
    }))
  })),
  agent: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "4",
      y: "8",
      width: "16",
      height: "11",
      rx: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 4v4M8.5 13v1M15.5 13v1"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M2 13v2M22 13v2"
    }))
  })),
  users: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M16 19v-1a4 4 0 00-8 0v1"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "9",
      r: "3"
    }))
  })),
  trophy: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M7 4h10v4a5 5 0 01-10 0V4z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 19h6M10 19l.5-3h3l.5 3"
    }))
  })),
  settings: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1l-.3-2.5H9.4l-.3 2.5a7 7 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.3 2.5h5.2l.3-2.5a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"
    }))
  })),
  send: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M7 17L17 7M17 7H9M17 7v8"
    })
  })),
  receive: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M17 7L7 17M7 17h8M7 17V9"
    })
  })),
  swap: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M7 4v12M7 16l-3-3M7 16l3-3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M17 20V8M17 8l-3 3M17 8l3 3"
    }))
  })),
  plus: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M12 5v14M5 12h14"
    })
  })),
  copy: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "9",
      y: "9",
      width: "11",
      height: "11",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5 15V5a2 2 0 012-2h8"
    }))
  })),
  qr: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "4",
      y: "4",
      width: "6",
      height: "6",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "14",
      y: "4",
      width: "6",
      height: "6",
      rx: "1"
    }), /*#__PURE__*/React.createElement("rect", {
      x: "4",
      y: "14",
      width: "6",
      height: "6",
      rx: "1"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M14 14h2v2M20 14v.01M14 20h6"
    }))
  })),
  arrowLeft: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M15 19l-7-7 7-7"
    })
  })),
  arrowRight: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M9 5l7 7-7 7"
    })
  })),
  google: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    size: p.size || 20,
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M21 12.2c0-.6-.1-1.2-.2-1.8H12v3.4h5a4.3 4.3 0 01-1.9 2.8v2.3h3a9 9 0 002.8-6.7z",
      fill: "#4285F4",
      stroke: "none"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 21c2.4 0 4.5-.8 6-2.2l-3-2.3c-.8.6-1.9.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0012 21z",
      fill: "#34A853",
      stroke: "none"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M7 13.7a5.4 5.4 0 010-3.4V8H4a9 9 0 000 8l3-2.3z",
      fill: "#FBBC05",
      stroke: "none"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 004 8l3 2.3c.7-2.1 2.7-3.7 5-3.7z",
      fill: "#EA4335",
      stroke: "none"
    }))
  })),
  bell: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M13.7 21a2 2 0 01-3.4 0"
    }))
  })),
  sun: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 2v2M12 20v2M5 5l1.5 1.5M17.5 17.5L19 19M2 12h2M20 12h2M5 19l1.5-1.5M17.5 6.5L19 5"
    }))
  })),
  moon: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M21 12.8A8 8 0 1111 3a6 6 0 0010 9z"
    })
  })),
  check: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M5 12.5l4.5 4.5L19 7.5"
    })
  })),
  chevron: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M9 6l6 6-6 6"
    })
  })),
  back: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M12 19l-7-7 7-7M5 12h14"
    })
  })),
  flame: p => /*#__PURE__*/React.createElement(Icon, _extends({}, p, {
    d: /*#__PURE__*/React.createElement("path", {
      d: "M12 3c1 3 4 4 4 8a4 4 0 11-8 0c0-2 1-3 1-3s.5 1.5 1.5 1.5S12 6 12 3z"
    })
  }))
};
window.Icons = Icons;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mironpay-app/icons.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.VerifiedBadge = __ds_scope.VerifiedBadge;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.PinDots = __ds_scope.PinDots;

__ds_ns.MironScoreCard = __ds_scope.MironScoreCard;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.QuickAction = __ds_scope.QuickAction;

__ds_ns.TokenRow = __ds_scope.TokenRow;

__ds_ns.WalletCard = __ds_scope.WalletCard;

})();
