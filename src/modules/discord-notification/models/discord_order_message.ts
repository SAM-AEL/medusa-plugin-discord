import { model } from "@medusajs/framework/utils"

const DiscordOrderMessage = model.define("discord_order_message", {
    id: model.id().primaryKey(),
    order_id: model.text().index("IDX_discord_order_message_order_id"),
    webhook_url: model.text(),
    message_id: model.text(),
})

export default DiscordOrderMessage
