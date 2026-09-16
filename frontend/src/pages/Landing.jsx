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
          ".terminal-grid",
          {
            opacity: 0,
            x: 35,
            duration: 1.1,
          },
          "-=0.8",
        )
        .from(
          ".landing-copy",
          {
            y: 24,
            opacity: 0,
            duration: 0.7,
          },
          "-=0.35",
        )
        .from(
          ".terminal-signin, .landing-action",
          {
            y: 12,
            opacity: 0,
            stagger: 0.12,
            duration: 0.5,
          },
          "-=0.55",
        );

      gsap.to(".terminal-grid", {
        x: -18,
        duration: 8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      gsap.to(".terminal-signin", {
        boxShadow: "0 8px 18px rgba(231, 111, 81, 0.24)",
        duration: 1.8,
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
      <div className="terminal-grid" aria-hidden="true" />

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
          SmartRoad
        </button>

        <button type="button" onClick={openLogin} className="terminal-signin">
          Sign up
        </button>
      </nav>

      {/* =====================================================
          HERO CONTENT
      ===================================================== */}

      <section className="terminal-content">
        <div className="landing-copy">
          <p className="landing-kicker">Road safety analysis workspace</p>
          <h1>Understand the road before you make the decision.</h1>
          <p>
            Create focused audits, review segment-level risk factors, and turn
            location data into practical field action.
          </p>
          <button type="button" onClick={openLogin} className="landing-action">
            Start an audit
          </button>
        </div>
      </section>
    </main>
  );
}

export default Landing;
