import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DISCORD_NOTIFICATION_MODULE } from "../../../../modules/discord-notification"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const discordSvc = req.scope.resolve(DISCORD_NOTIFICATION_MODULE) as any

    try {
        const settings = await discordSvc.getSettings()
        res.json({ settings })
    } catch (error) {
        res.status(500).json({ message: "Internal server error" })
    }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
    const discordSvc = req.scope.resolve(DISCORD_NOTIFICATION_MODULE) as any
    const body = req.body as { avatar_url?: string; footer_text?: string }

    try {
        await discordSvc.upsertSettings({
            avatar_url: body.avatar_url || null,
            footer_text: body.footer_text || null,
        })
        const settings = await discordSvc.getSettings()
        res.json({ settings })
    } catch (error) {
        res.status(500).json({ message: "Internal server error" })
    }
}
