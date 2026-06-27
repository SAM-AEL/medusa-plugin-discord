# @sam-ael/medusa-plugin-discord

A Discord webhook notification plugin for **Medusa v2**. Route store events to your Discord channels with rich embed cards that automatically update in-place as order status changes.

[Medusa Website](https://medusajs.com/) | [Medusa Repository](https://github.com/medusajs/medusa)

---

## Features

- **Live Message Editing:** Tracks a single message per order, editing it in place as status changes (Placed → Fulfilled → Shipped → Completed/Canceled). Avoids channel spam.
- **Shipment & Tracking Links:** Displays tracking numbers and carriers as clickable Discord markdown links when an order is shipped.
- **Premium Rich Embeds:** Beautiful, color-coded status embeds (🟡 Pending → 🚚 Shipped → 🟢 Completed → 🔴 Canceled).
- **Custom Markdown Templates:** Custom template support with placeholders (`{total}`, `{tracking_links}`, etc.) using Discord Markdown.
- **Interactive Settings UI:** Manage all webhook channels, events, and templates directly from the Medusa Admin panel.
- **Automatic Price Formatting:** Automatically converts currency values from Medusa integer cents to formatted human-readable decimals.

---

## Prerequisites

- [Node.js v18 or greater](https://nodejs.org/en)
- [A Medusa v2 backend](https://docs.medusajs.com/v2)
- A Discord account and server with permission to manage webhooks

---

## Installation

Run the following command to install the plugin in your Medusa project:

```bash
yarn add @sam-ael/medusa-plugin-discord
```

---

## Configuration

### 1. Register in `medusa-config.ts`

Add the plugin configuration block to your `medusa-config.ts` file:

```ts
import { DiscordNotificationOptions } from "@sam-ael/medusa-plugin-discord/modules/discord-notification"

const plugins = [
  // ... other plugins
  {
    resolve: "@sam-ael/medusa-plugin-discord",
    options: {
      defaultBotName: process.env.DISCORD_DEFAULT_BOT_NAME || "Discord Bot",
    } satisfies DiscordNotificationOptions,
  },
]
```

### 2. Environment Variables

Define the optional environment variables in your `.env` file:

```env
DISCORD_DEFAULT_BOT_NAME="My Store Bot"
```

### 3. Run Migrations

To create the database schemas for storing your webhook mappings and Discord message mappings, run:

```bash
npx medusa db:migrate
```

---

## Webhooks & API Reference

Discord notifications are outbound webhook updates triggered by internal Medusa events. This plugin does not listen to inbound webhooks from Discord.

### Admin API Endpoints

Use these endpoints to programmatically manage your notifications and channels (which are also accessible via the built-in Settings UI).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/discord/mappings` | List all webhook mappings |
| `POST` | `/admin/discord/mappings` | Create a new webhook mapping |
| `POST` | `/admin/discord/mappings/:id` | Update an existing mapping |
| `DELETE` | `/admin/discord/mappings/:id` | Delete a webhook mapping |
| `POST` | `/admin/discord/test` | Send a test notification using mock data |

#### Webhook Mapping Payload Example
```json
{
  "event_name": "order.placed",
  "webhook_url": "https://discord.com/api/webhooks/...",
  "channel_name": "#orders",
  "bot_name": "Enchauntee Sales Bot",
  "is_active": true,
  "message_template": "📦 New order **#{display_id}** from **{email}** — **{total} {currency_code}**"
}
```

### Supported Events
- `order.placed`
- `order.fulfillment_created`
- `fulfillment.shipment_created`
- `order.completed`
- `order.canceled`
- `order.updated`
- `customer.created`
- `customer.updated`

---

## Test the Plugin

1. Start your Medusa development server.
2. Log in to the Medusa Admin panel.
3. Navigate to **Settings → Discord Notifications**.
4. Create a mapping for `order.placed` and enter a valid Discord webhook URL.
5. Click the **Send Test Notification** button (or trigger the `/admin/discord/test` API endpoint via POST).
6. Verify that the test notification appears in your Discord channel.
