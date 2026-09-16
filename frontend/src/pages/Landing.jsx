import { useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";

function Landing() {
  const navigate = useNavigate();
  const heroRef = useRef(null);

  useLayoutEffect(() => {
    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: {
          ease: "power3.out",
        },
      });

      timeline
        .from(".terminal-nav", {
          y: -18,
          opacity: 0,
          duration: 0.7,
        })
        .from(
          ".terminal-log-line",
          {
            x: -24,
            opacity: 0,
            stagger: 0.16,
            duration: 0.55,
          },
          "-=0.2"
        )
        .from(
          ".terminal-title",
          {
            scale: 0.94,
            opacity: 0,
            duration: 0.9,
          },
          "-=0.1"
        )
        .from(
          ".terminal-title strong",
          {
            letterSpacing: "0.5em",
            opacity: 0,
            duration: 0.7,
          },
          "-=0.45"
        )
        .from(
          ".terminal-grid",
          {
            opacity: 0,
            x: 35,
            duration: 1.1,
          },
          "-=0.8"
        )
        .from(
          ".terminal-start, .terminal-status",
          {
            y: 12,
            opacity: 0,
            duration: 0.5,
          },
          "-=0.55"
        );

      gsap.to(".status-spinner", {
        rotate: 360,
        duration: 1.8,
        repeat: -1,
        ease: "none",
      });

      gsap.to(".terminal-line", {
        opacity: 0.55,
        duration: 1.4,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }, heroRef);

    return () => context.revert();
  }, []);

  function openLogin() {
    navigate("/login");
  }

  return (
    <main
      ref={heroRef}
      className="terminal-hero min-h-screen overflow-hidden text-slate-100"
    >
      {/* Background grid */}
      <div
        className="terminal-grid"
        aria-hidden="true"
      />

      {/* =====================================================
          NAVBAR
      ===================================================== */}

      <nav className="terminal-nav">

        <button
          type="button"
          onClick={() => navigate("/")}
          className="terminal-brand"
          aria-label="SmartRoad home"
        >
          <span className="terminal-mark">
            ◢
          </span>

          SmartRoad
        </button>

        <button
          type="button"
          onClick={openLogin}
          className="terminal-signin"
        >
          SIGN IN <span>↗</span>
        </button>

      </nav>

      {/* =====================================================
          HERO CONTENT
      ===================================================== */}

      <section className="terminal-content">

        <div className="terminal-log">

          <div className="terminal-log-line">
            09:16:21{" "}
            <b>
              INCOMING AUDIT REQUEST DETECTED
            </b>{" "}
            ...
          </div>

          <div className="terminal-log-line">
            09:16:24{" "}
            <b>
              SAFETY WORKSPACE WAKING UP
            </b>{" "}
            ...
          </div>

        </div>

        <button
          type="button"
          onClick={openLogin}
          className="terminal-title"
          aria-label="Open SmartRoad Audit workspace"
        >
          <span>
            ╔══════════════════════════════╗
          </span>

          <strong>
            SMARTROAD
            <br />
            AUDIT
          </strong>

          <span>
            ╚══════════════════════════════╝
          </span>
        </button>

      </section>

      {/* =====================================================
          CTA
      ===================================================== */}

      <button
        type="button"
        onClick={openLogin}
        className="terminal-start"
      >
        START AUDITING ON SMARTROAD TODAY{" "}
        <span>→</span>
      </button>

      {/* =====================================================
          STATUS
      ===================================================== */}

      <div className="terminal-status">
        <span className="status-spinner">
          ◔
        </span>

        APPLICATION READY
      </div>

      <div className="terminal-line" />

    </main>
  );
}

export default Landing;