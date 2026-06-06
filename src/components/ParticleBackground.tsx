import { useCallback } from "react";
import Particles, { ParticlesProvider } from "@tsparticles/react";
import type { Engine } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";
import { useTheme } from "./ThemeProvider";

const initParticles = async (engine: Engine) => {
  await loadSlim(engine);
};

export const ParticleBackground = () => {
  const { theme } = useTheme();

  return (
    <ParticlesProvider init={initParticles}>
      <Particles
        id="tsparticles"
        className="fixed inset-0 pointer-events-none z-0 mix-blend-screen opacity-60"
        options={{
        background: {
          color: {
            value: "transparent",
          },
        },
        fpsLimit: 60,
        interactivity: {
          events: {
            onHover: {
              enable: true,
              mode: "grab",
            },
          },
          modes: {
            grab: {
              distance: 150,
              links: {
                opacity: 0.3,
                color: theme === 'dark' ? '#fbbf24' : '#d97706', // amber
              },
            },
          },
        },
        particles: {
          color: {
            value: theme === 'dark' ? "#fbbf24" : "#d97706",
          },
          links: {
            color: theme === 'dark' ? "#fbbf24" : "#d97706",
            distance: 150,
            enable: true,
            opacity: 0.1,
            width: 1,
          },
          move: {
            direction: "none",
            enable: true,
            outModes: {
              default: "bounce",
            },
            random: false,
            speed: 0.5,
            straight: false,
          },
          number: {
            density: {
              enable: true,
              width: 800,
              height: 800,
            },
            value: 40,
          },
          opacity: {
            value: 0.2,
          },
          shape: {
            type: "circle",
          },
          size: {
            value: { min: 1, max: 3 },
          },
        },
        detectRetina: true,
      }}
    />
    </ParticlesProvider>
  );
};
