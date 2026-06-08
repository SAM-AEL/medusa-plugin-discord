# @sam-ael/medusa-plugin-discord

A Discord webhook notification plugin for **Medusa v2**. Route store events to your Discord channels with rich embed cards that automatically update in-place as order status changes — from placed → fulfilled → shipped → completed or canceled.

## Features

- **Live Message Editing** — One message per order, edited in place as status changes. No channel spam.
- **Shipment & Tracking** — Displays tracking numbers and links as clickable Discord markdown when an order is shipped.
- **Premium Rich Embeds** — Beautiful default embed cards with color-coded status badges (🟡 Pending → 🚚 Shipped → 🟢 Completed → 🔴 Canceled).
- **Custom Markdown Templates** — Write your own message templates using Discord Markdown with `{placeholders}`.
- **Configurable Bot Name** — Set a global fallback bot name via plugin config or env var, and override per-channel from the Admin UI.
- **Interactive Admin UI** — Manage all webhook mappings and templates directly from the Medusa Admin panel settings.
- **Placeholder Sidebar** — Click a field (e.g. `{total}`, `{tracking_links}`) to insert it at your cursor in the template editor.
- **Price Formatting** — Automatically converts price fields from Medusa's integer cents to human-readable decimals.
- **Multiple Event Triggers** — Supports order, fulfillment, shipment, and customer events.

---

## Installation

```bash
yarn add @sam-ael/medusa-plugin-discord
```

---

## Setup

### 1. Add to `medusa-config.ts`

```ts
import { DiscordNotificationOptions } from "@sam-ael/medusa-plugin-discord/modules/discord-notification"

plugins: [
  {
    resolve: "@sam-ael/medusa-plugin-discord",
    options: {
      // Global fallback bot name. Can also be set via env var (see below).
      // Per-mapping bot names set in the Admin UI take priority over this.
      defaultBotName: process.env.DISCORD_DEFAULT_BOT_NAME || "Discord Bot",
    } satisfies DiscordNotificationOptions,
  },
],
```

### 2. Set Environment Variables (Optional)

```bash
# .env
DISCORD_DEFAULT_BOT_NAME="My Store Bot"
```

### 3. Run Migrations

```bash
npx medusa db:migrate
```

---

## Admin UI

Navigate to **Settings → Discord Notifications** in the Medusa Admin panel.

### Webhook Mapping Fields

| Field | Required | Description |
|---|---|---|
| Event Trigger | ✅ | Which Medusa event fires this webhook |
| Discord Webhook URL | ✅ | Full Discord webhook URL |
| Channel Label | ❌ | Friendly label (e.g. `#orders`) — display only |
| Bot Name | ❌ | Override the bot's display name for this channel. Falls back to `defaultBotName` plugin option → `"Discord Bot"` |
| Custom Message Template | ❌ | Discord Markdown template. Leave blank for default rich embed. |
| Enabled | ✅ | Toggle to activate/deactivate without deleting |

---

## Message Lifecycle (In-Place Editing)

The plugin stores the Discord `message_id` returned when an order notification is first posted. All subsequent events for the same order **edit that same message** rather than posting new ones.

```
order.placed           → POST new message  → message_id saved to DB
order.fulfillment_created → PATCH same message  → status updated to "Fulfillment Created 📦"
fulfillment.shipment_created → PATCH same message → status + tracking links shown 🚚
order.completed        → PATCH same message → status "Completed ✅" (green)
order.canceled         → PATCH same message → status "Canceled 🔴" (red)
```

If the original Discord message is manually deleted, the plugin automatically posts a fresh message and saves the new `message_id`.

---

## Supported Events

| Event | Description |
|---|---|
| `order.placed` | New order placed |
| `order.fulfillment_created` | Fulfillment created for an order |
| `fulfillment.shipment_created` | Shipment created with tracking info |
| `order.completed` | Order marked as completed |
| `order.canceled` | Order canceled |
| `order.updated` | Order updated |
| `customer.created` | New customer registered |
| `customer.updated` | Customer profile updated |

---

## Template Placeholders

### Order Events
| Placeholder | Description |
|---|---|
| `{id}` | Order ID |
| `{display_id}` | Human-readable order number |
| `{status}` | Order status |
| `{total}` | Order total (formatted as decimal) |
| `{subtotal}` | Subtotal (formatted as decimal) |
| `{currency_code}` | Currency code (e.g. `usd`) |
| `{email}` | Customer email |
| `{payment_status}` | Payment status |
| `{fulfillment_status}` | Fulfillment status |
| `{shipment_status}` | `Pending`, `Fulfillment Created`, or `Shipped` |
| `{tracking_numbers}` | Comma-separated tracking numbers |
| `{tracking_links}` | Tracking numbers as clickable Discord markdown links |
| `{shipping_address.first_name}` | Shipping first name |
| `{shipping_address.last_name}` | Shipping last name |
| `{shipping_address.city}` | Shipping city |
| `{customer.email}` | Customer account email |

### Customer Events
| Placeholder | Description |
|---|---|
| `{id}` | Customer ID |
| `{email}` | Email address |
| `{first_name}` | First name |
| `{last_name}` | Last name |
| `{phone}` | Phone number |

---

## Plugin Options

```ts
type DiscordNotificationOptions = {
  /**
   * Global fallback bot username shown in Discord when no
   * per-mapping bot_name is configured in the Admin UI.
   * Defaults to "Discord Bot".
   */
  defaultBotName?: string
}
```

---

## Admin API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/discord/mappings` | List all webhook mappings |
| `POST` | `/admin/discord/mappings` | Create a new webhook mapping |
| `POST` | `/admin/discord/mappings/:id` | Update a webhook mapping |
| `DELETE` | `/admin/discord/mappings/:id` | Delete a webhook mapping |
| `POST` | `/admin/discord/test` | Send a test notification using mock data |

### Mapping Payload

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

---

## Development

```bash
yarn typecheck
yarn build
```

---

## License

MIT
