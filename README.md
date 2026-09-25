# Federated Health Care - Resource Platform (PoC)

## Project Overview
A React-based Proof of Concept (PoC) dashboard built for a hackathon. It visualizes simulated healthcare telemetry and demonstrates real-time state management for medical resource redistribution.

## Current Features Built
- **Database Integration:** Reads and writes to a Supabase PostgreSQL database (`phc_nodes`, `phc_telemetry_live`, `resource_redistribution_orders`).
- **Real-Time UI Updates:** Uses Supabase WebSockets to instantly update the "Live Logistics" panel and metric counters without page refreshes when a new transfer is inserted or deleted.
- **Data Visualization:** Includes a 30-day simulated trend chart built with `recharts` to mock predictive demand forecasting.
- **Redistribution Logic:** A simulated routing function that calculates basic medicine and staff transfer amounts from a surplus hospital to a deficit hospital based on static UI triggers.

## Tech Stack
- React
- Vite
- Tailwind CSS
- Supabase (Database & Realtime)
- Recharts

## Local Setup
1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create a `.env` file in the root directory and add the following keys for the database connection:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```
