import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DISCORD_NOTIFICATION_MODULE } from "../../../../../modules/discord-notification"
import { ok, fail } from "../../../../../shared/http"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
    const discordSvc = req.scope.resolve(DISCORD_NOTIFICATION_MODULE)
    const { id } = req.params
    const body = req.body as Record<string, any>

    const { event_name, webhook_url, channel_name, is_active, message_template, bot_name } = body

    try {
        const existing = await (discordSvc as any).retrieveDiscordWebhookMapping(id)
        if (!existing) {
            return fail(res, 404, "NOT_FOUND", `Webhook mapping with ID ${id} not found`)
        }

        if (webhook_url && !webhook_url.startsWith("https://discord.com/api/webhooks/") && !webhook_url.startsWith("https://discordapp.com/api/webhooks/")) {
            return fail(res, 400, "INVALID_WEBHOOK_URL", "webhook_url must be a valid Discord Webhook URL")
        }

        const updateData: Record<string, any> = {}
        if (event_name !== undefined) updateData.event_name = event_name
        if (webhook_url !== undefined) updateData.webhook_url = webhook_url
        if (channel_name !== undefined) updateData.channel_name = channel_name || null
        if (is_active !== undefined) updateData.is_active = is_active
        if (message_template !== undefined) updateData.message_template = message_template || null
        if (bot_name !== undefined) updateData.bot_name = bot_name || null

        const mapping = await (discordSvc as any).updateDiscordWebhookMappings({
            id,
            ...updateData,
        })

        return ok(res, { mapping })
    } catch (err: any) {
        return fail(res, 500, "ERROR", err.message || "Failed to update webhook mapping")
    }
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
    const discordSvc = req.scope.resolve(DISCORD_NOTIFICATION_MODULE)
    const { id } = req.params

    try {
        const existing = await (discordSvc as any).retrieveDiscordWebhookMapping(id)
        if (!existing) {
            return fail(res, 404, "NOT_FOUND", `Webhook mapping with ID ${id} not found`)
        }

        await (discordSvc as any).deleteDiscordWebhookMappings(id)

        return ok(res, { deleted: true, id })
    } catch (err: any) {
        return fail(res, 500, "ERROR", err.message || "Failed to delete webhook mapping")
    }
}
