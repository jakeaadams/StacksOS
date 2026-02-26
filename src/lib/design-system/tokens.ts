/**
 * StacksOS Design Tokens
 *
 * Programmatic access to the semantic design tokens defined in globals.css.
 * Mirrors the CSS custom properties for use in TypeScript (runtime logic,
 * Storybook controls, tests, etc.).
 */

export const designTokens = {
  color: {
    status: {
      success: {
        DEFAULT: "142 71% 45%",
        bg: "142 76% 96%",
        text: "142 72% 29%",
      },
      warning: {
        DEFAULT: "38 92% 50%",
        bg: "48 96% 95%",
        text: "38 92% 30%",
      },
      error: {
        DEFAULT: "0 70% 52%",
        bg: "0 70% 97%",
        text: "0 72% 38%",
      },
      info: {
        DEFAULT: "208 62% 44%",
        bg: "208 62% 96%",
        text: "208 62% 30%",
      },
    },
    statusDark: {
      success: {
        DEFAULT: "142 71% 55%",
        bg: "142 40% 15%",
        text: "142 60% 75%",
      },
      warning: {
        DEFAULT: "38 92% 60%",
        bg: "38 40% 15%",
        text: "38 80% 75%",
      },
      error: {
        DEFAULT: "0 70% 62%",
        bg: "0 40% 15%",
        text: "0 60% 75%",
      },
      info: {
        DEFAULT: "208 62% 54%",
        bg: "208 40% 15%",
        text: "208 50% 75%",
      },
    },
  },

  typography: {
    size: {
      heading1: "2rem",
      heading2: "1.5rem",
      heading3: "1.25rem",
      heading4: "1.125rem",
      body: "0.9375rem",
      bodySm: "0.8125rem",
      caption: "0.75rem",
    },
    weight: {
      heading: 600,
      body: 400,
    },
    tracking: {
      heading: "-0.02em",
      body: "-0.01em",
    },
    leading: {
      heading: 1.2,
      body: 1.5,
    },
  },

  spacing: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
    16: "4rem",
  },

  motion: {
    duration: {
      fast: "150ms",
      normal: "250ms",
      slow: "400ms",
    },
    easing: {
      default: "cubic-bezier(0.2, 0.68, 0.14, 1)",
      spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      decelerate: "cubic-bezier(0, 0, 0.2, 1)",
      accelerate: "cubic-bezier(0.4, 0, 1, 1)",
    },
  },

  component: {
    cardRadius: "var(--radius)",
    inputRadius: "calc(var(--radius) - 4px)",
    buttonRadius: "calc(var(--radius) - 4px)",
    badgeRadius: "999px",
    avatarRadius: "999px",
    sidebarWidth: "16rem",
    topbarHeight: "3.5rem",
  },
} as const;

export type DesignTokens = typeof designTokens;
