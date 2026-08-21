/**
 * Anything thrown during render would otherwise unmount the whole tree and
 * leave a blank window with no clue what happened. Catch it and show the error
 * where it can be read.
 */
import { Component } from "react";
import { C, MONO, label } from "./ui/theme.js";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Also to the console, so it is in the log even if the window is closed.
    console.error("render failed:", error, info && info.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ background: C.paper, minHeight: "100vh", padding: 32, color: C.ink }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
            Chess Lab
          </div>
          <div
            style={{
              marginTop: 20, background: C.card, border: `1px solid ${C.red}`,
              borderRadius: 2, padding: 20,
            }}
          >
            <div style={label({ color: C.red })}>something broke while drawing the screen</div>
            <div style={{ fontFamily: MONO, fontSize: 15, marginTop: 8, color: C.ink }}>
              {String(error && error.message ? error.message : error)}
            </div>

            {error && error.stack && (
              <pre
                style={{
                  fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.mute,
                  marginTop: 14, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  maxHeight: 260, overflow: "auto",
                }}
              >
                {error.stack}
              </pre>
            )}

            {info && info.componentStack && (
              <>
                <div style={label({ marginTop: 14 })}>where</div>
                <pre
                  style={{
                    fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.mute,
                    marginTop: 6, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto",
                  }}
                >
                  {info.componentStack}
                </pre>
              </>
            )}

            <button
              onClick={() => window.location.reload()}
              style={{
                ...label({ color: "#F7F5EF" }), background: C.indigo,
                border: `1px solid ${C.indigo}`, borderRadius: 2,
                padding: "10px 14px", marginTop: 18, cursor: "pointer",
              }}
            >
              reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
