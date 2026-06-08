import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DISCORD_NOTIFICATION_MODULE } from "../../../../modules/discord-notification"
import { ok, fail, parsePagination } from "../../../../shared/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const discordSvc = req.scope.resolve(DISCORD_NOTIFICATION_MODULE)
    const { limit, offset } = parsePagination(req.query as Record<string, unknown>)

    const [mappings, count] = await (discordSvc as any).listAndCountDiscordWebhookMappings(
        {},
        {
            take: limit,
            skip: offset,
            order: { created_at: "DESC" },
        }
    )

    return ok(res, { mappings, count })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
    const discordSvc = req.scope.resolve(DISCORD_NOTIFICATION_MODULE)
    const body = req.body as Record<string, any>

    const { event_name, webhook_url, channel_name, is_active, message_template, bot_name } = body

    if (!event_name || !webhook_url) {
        return fail(res, 400, "INVALID_PAYLOAD", "event_name and webhook_url are required")
    }

    if (!webhook_url.startsWith("https://discord.com/api/webhooks/") && !webhook_url.startsWith("https://discordapp.com/api/webhooks/")) {
        return fail(res, 400, "INVALID_WEBHOOK_URL", "webhook_url must be a valid Discord Webhook URL")
    }

    const mapping = await (discordSvc as any).createDiscordWebhookMappings({
        event_name,
        webhook_url,
        channel_name: channel_name || null,
        is_active: is_active !== undefined ? is_active : true,
        message_template: message_template || null,
        bot_name: bot_name || null,
    })

    return ok(res, { mapping }, 201)
}
