# Product

## Register

product

## Users

Ekas (admin), Raman (sales), and 2 field technicians (Tech 1, Tech 2) at a small Vancouver security-install business. They use the app from a mix of desktops and phones, often on the road or in a customer driveway. Sales books installs after closing TELUS-overpay customers; techs post their availability so the bookings can land inside real hours. They are not designers and they are not patient with chrome that doesn't earn its place.

## Product Purpose

A small internal scheduling tool. Sales pick a technician, a slot inside that tech's posted availability, a client name and address, and the job lands on the calendar. Techs see their own week. The boss sees everything and can add/rename/reset users. The job is to stop three people from texting each other availability windows.

## Brand Personality

Industrial, terse, no-nonsense. The site of the business is a pickup truck and a ladder. The app should feel like a clipboard a tech would actually use: dense, fast, no marketing prose. Personality in three words: **direct, capable, quiet**.

## Anti-references

- Generic SaaS dashboards with hero-metric blocks, glassmorphism, gradient text, or floating cards-on-cards.
- Material Design "elevated card" stacks with uppercase-12px labels above every field.
- Anything that says "Welcome back, ekas!" or contains marketing buzzwords (streamline, empower, transform).
- Animated decorative motion. The app should feel like an appliance, not a landing page.

## Design Principles

- **Show data first.** Every screen has a primary list or schedule. Decoration, if any, is the smallest possible thing that gets out of the way.
- **Group, don't card.** iOS-style grouped tables beat stacked cards. Flat beat elevated. 1px hairlines beat shadows.
- **One accent color, used sparingly.** The system blue is for primary action and the active state. Period. Pills, status, and the active nav link earn it; borders, headings, and dim labels do not.
- **Dense without being cramped.** Two related fields on one row (chevron, value) when possible. Generous touch targets (44px min) but tight visual rhythm.
- **Quiet typography.** SF Pro / system stack. Large titles for orientation, 17px body, 13px for dim metadata. No uppercase labels above every input. No em dashes in copy.

## Accessibility & Inclusion

WCAG 2.1 AA. Min 4.5:1 contrast for body text (placeholder text included). 44×44 px touch targets. Respect `prefers-reduced-motion`. Respect `prefers-color-scheme` (dark + light). Color is never the only signal of state (status pills also have text). Plain language; assume the reader is at a job site with one hand free.
