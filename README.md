# Web App Telegram - RNF Shop System 🛒

A professional, mobile-optimized Telegram Mini App designed for seamless digital product sales. This web application integrates directly with Supabase for real-time inventory and product management, while keeping high-stakes transaction logic secure within the Telegram Bot environment.

## 🌟 Key Features

- **Dynamic Catalog**: Real-time product and variant data fetched from Supabase.
- **Admin Dashboard**: Secure interface for managing products and stock directly from the web.
- **Stock Tracking**: Automated inventory management with bulk insert and duplicate detection.
- **Telegram Native**: Environment detection ensures the app only runs fully within the Telegram Mini App ecosystem.
- **Premium UI**: Sleek, modern design using Tailwind CSS with glassmorphism effects.

## 🛡️ Security Architecture

To ensure maximum security:
- **Client-Side Only**: The Web App focuses on display and management.
- **Transaction Safety**: All checkout and payment processing (QRIS, Balance) are handled by the Telegram Bot backend to prevent fraudulent activities.
- **Environment Fallback**: Non-Telegram browsers are automatically redirected to a promotional landing page.

## 🛠️ Technology Stack

- **Frontend**: Plain HTML, Vanilla JavaScript, CSS3
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Icons**: Font Awesome 6
- **Animations**: CSS Animations & SwatAlert2

## 🚀 Getting Started

### Prerequisites

- A Supabase account and project.
- A Telegram Bot created via [@BotFather](https://t.me/BotFather).

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rifkynf1/Web-App-Telegram.git
   ```

2. **Configure Database**:
   - Copy `src/js/config.example.js` to `src/js/config.js`.
   - Update `SUPABASE_URL` and `SUPABASE_ANON_KEY` with your project credentials.

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Run Locally**:
   ```bash
   npm run dev
   ```

## 📈 Deployment

Recommended hosting via **Vercel**:
- **Framework Preset**: Other
- **Build Command**: `npm run build`
- **Output Directory**: `src`

---
Developed with ❤️ by **RNF System**
