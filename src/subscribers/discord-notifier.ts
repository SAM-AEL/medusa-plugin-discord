import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { DISCORD_NOTIFICATION_MODULE } from "../modules/discord-notification"

type EventPayload = {
    id: string
    order_id?: string
}

function getNestedValue(obj: any, path: string): any {
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
    }
    return current;
}

function extractNumeric(value: any): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") return Number(value);
    if (typeof value === "object" && value !== null) {
        if ("numeric_" in value) return Number(value.numeric_);
        if ("raw_" in value && value.raw_ !== null && "value" in value.raw_) return Number(value.raw_.value);
        if ("value" in value) return Number(value.value);
        if (typeof value.valueOf === "function") {
            const val = value.valueOf();
            if (typeof val === "number" || typeof val === "string") return Number(val);
        }
    }
    return Number(value);
}

function formatValue(value: any, path: string, rootData?: any): string {
    if (value === undefined || value === null) {
        return "";
    }
    
    const isPrice = path === "total" || path === "subtotal" || path.endsWith(".total") || path.endsWith(".subtotal") || path.endsWith(".price") || path.endsWith(".unit_price");
    
    if (isPrice) {
        const num = extractNumeric(value);
        if (!isNaN(num) && rootData && rootData.currency_code) {
             const formatter = new Intl.NumberFormat('en-US', {
                 style: 'currency',
                 currency: rootData.currency_code.toUpperCase(),
             });
             return formatter.format(num);
        }
        return isNaN(num) ? "0" : num.toString();
    }

    if (typeof value === "number") {
        return value.toString();
    }
    if (Array.isArray(value)) {
        if (path === "items" || path.endsWith(".items")) {
            return value.map((item: any) => {
                if (typeof item === "object" && item !== null) {
                    const title = item.title || item.name || "Item";
                    const qty = item.quantity !== undefined ? ` (Qty: ${item.quantity})` : "";
                    
                    let priceStr = "";
                    if (item.unit_price !== undefined) {
                        const pNum = extractNumeric(item.unit_price);
                        if (!isNaN(pNum)) {
                            if (rootData && rootData.currency_code) {
                                const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: rootData.currency_code.toUpperCase() });
                                priceStr = ` - ${formatter.format(pNum)}`;
                            } else {
                                priceStr = ` - ${pNum}`;
                            }
                        }
                    }
                    return `- ${title}${qty}${priceStr}`;
                }
                return `- ${String(item)}`;
            }).join("\n");
        }
        return value.map(val => String(val)).join(", ");
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}

function compileTemplate(template: string, data: any): string {
    const isJson = template.trim().startsWith("{") && template.trim().endsWith("}");
    return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (match, path) => {
        const value = getNestedValue(data, path);
        let formatted = formatValue(value, path, data);
        if (isJson && typeof formatted === "string") {
            formatted = formatted.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
        }
        return formatted;
    });
}

// Safely resolve the Order ID from different Medusa event structures
async function resolveOrderId(name: string, data: any, query: any, logger: any): Promise<string | null> {
    if (!data) return null

    if (data.order_id) {
        return data.order_id
    }

    if (data.id) {
        // 1. Try to fetch as direct Order ID
        try {
            const { data: orders } = await query.graph({
                entity: "order",
                fields: ["id"],
                filters: { id: data.id },
            })
            if (orders && orders.length > 0) {
                return orders[0].id
            }
        } catch (e) {
            // Not a direct order
        }

        // 2. Try to fetch as Fulfillment ID linked to an order
        try {
            const { data: linkedOrders } = await query.graph({
                entity: "order",
                fields: ["id"],
                filters: {
                    fulfillments: {
                        id: data.id
                    }
                }
            })
            if (linkedOrders && linkedOrders.length > 0) {
                return linkedOrders[0].id
            }
        } catch (e) {
            // Not a fulfillment ID linked to order
        }

        // 3. Try to fetch as Payment ID linked to an order
        try {
            const { data: payments } = await query.graph({
                entity: "payment",
                fields: ["id", "payment_collection_id"],
                filters: { id: data.id }
            })
            if (payments && payments.length > 0 && payments[0].payment_collection_id) {
                const { data: linkedOrders } = await query.graph({
                    entity: "order",
                    fields: ["id"],
                    filters: {
                        payment_collections: {
                            id: payments[0].payment_collection_id
                        }
                    }
                })
                if (linkedOrders && linkedOrders.length > 0) {
                    return linkedOrders[0].id
                }
            }
        } catch (e) {
            // Not a payment ID
        }

        // 4. Try to fetch as Payment Collection ID linked to an order
        try {
            const { data: linkedOrders } = await query.graph({
                entity: "order",
                fields: ["id"],
                filters: {
                    payment_collections: {
                        id: data.id
                    }
                }
            })
            if (linkedOrders && linkedOrders.length > 0) {
                return linkedOrders[0].id
            }
        } catch (e) {
            logger.warn(`Could not resolve order from ID ${data.id}: ${e}`)
        }
    }

    return null
}

export default async function discordNotificationHandler({
    event: { name, data },
    container,
}: SubscriberArgs<EventPayload>) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const discordSvc = container.resolve(DISCORD_NOTIFICATION_MODULE) as any
    const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

    try {
        const globalSettings = await discordSvc.getSettings()

        // Handle Customer Events separately (not order-centric, always new messages)
        if (name.startsWith("customer.")) {
            const mappings = await discordSvc.listDiscordWebhookMappings({
                event_name: name,
                is_active: true,
            })

            if (!mappings || mappings.length === 0) {
                return
            }

            const { data: customers } = await query.graph({
                entity: "customer",
                fields: ["id", "email", "first_name", "last_name", "phone"],
                filters: { id: data.id },
            })

            const customer = customers?.[0]
            if (!customer) {
                logger.warn(`Customer ${data.id} not found when trying to send Discord notification`)
                return
            }

            const nameStr = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "New Customer"
            const title = name === "customer.created" ? "👤 New Customer Registered" :
                          name === "customer.updated" ? "👤 Customer Profile Updated" :
                          `👤 Customer Event: ${name}`
            const description = name === "customer.created" ? `A new customer account has been created on the storefront.` :
                                `Customer account **${customer.id}** was updated.`

            const defaultPayload = {
                username: discordSvc.getDefaultBotName(),
                embeds: [
                    {
                        title: title,
                        description: description,
                        color: 3447003, // Blue
                        fields: [
                            { name: "Name", value: nameStr, inline: true },
                            { name: "Email", value: customer.email || "N/A", inline: true }
                        ],
                        timestamp: new Date().toISOString(),
                        footer: { text: globalSettings.footer_text || "Medusa Storefront" }
                    }
                ]
            }

            if (globalSettings.avatar_url) {
                (defaultPayload as any).avatar_url = globalSettings.avatar_url;
            }

            await Promise.all(
                mappings.map(async (mapping: any) => {
                    try {
                        let finalPayload: any
                        if (mapping.message_template) {
                            const content = compileTemplate(mapping.message_template, customer)
                            try {
                                const parsedJson = JSON.parse(content)
                                finalPayload = {
                                    username: mapping.bot_name || discordSvc.getDefaultBotName(),
                                    ...(globalSettings.avatar_url ? { avatar_url: globalSettings.avatar_url } : {}),
                                    ...parsedJson
                                }
                            } catch (e) {
                                finalPayload = {
                                    username: mapping.bot_name || discordSvc.getDefaultBotName(),
                                    ...(globalSettings.avatar_url ? { avatar_url: globalSettings.avatar_url } : {}),
                                    content: content
                                }
                            }
                        } else {
                            finalPayload = {
                                ...defaultPayload,
                                username: mapping.bot_name || discordSvc.getDefaultBotName(),
                            }
                        }

                        await fetch(mapping.webhook_url, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(finalPayload),
                        })
                    } catch (e) {
                        logger.error(`Error sending customer notification to ${mapping.webhook_url}: ${e}`)
                    }
                })
            )
            return
        }

        // Handle Order/Fulfillment/Shipment Events (Support editing the same message)
        const orderId = await resolveOrderId(name, data, query, logger)
        if (!orderId) {
            return
        }

        // Fetch complete order details
        const { data: orders } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "display_id",
                "status",
                "payment_status",
                "fulfillment_status",
                "email",
                "currency_code",
                "total",
                "subtotal",
                "summary.*",
                "shipping_address.first_name",
                "shipping_address.last_name",
                "shipping_address.phone",
                "shipping_address.city",
                "billing_address.first_name",
                "billing_address.last_name",
                "billing_address.phone",
                "customer.first_name",
                "customer.last_name",
                "customer.email",
                "customer.phone",
                "items.title",
                "items.quantity",
                "items.unit_price",
                "items.thumbnail",
                "fulfillments.id",
                "fulfillments.shipped_at",
                "fulfillments.delivered_at",
                "fulfillments.canceled_at",
                "fulfillments.labels.tracking_number",
                "fulfillments.labels.tracking_url",
                "fulfillments.provider_id",
            ],
            filters: { id: orderId },
        })

        const order = orders?.[0]
        if (!order) {
            logger.warn(`Order ${orderId} not found when trying to send Discord notification`)
            return
        }

        // Format and compile order status & tracking info
        let rawPaymentStatus = order.payment_status || "awaiting"
        if (name === "payment.captured") rawPaymentStatus = "captured"
        if (name === "payment.refunded") rawPaymentStatus = "refunded"
        const paymentStatusFormatted = rawPaymentStatus.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
        
        let rawFulfillmentStatus = order.fulfillment_status || "not_fulfilled"
        if (name === "fulfillment.created") rawFulfillmentStatus = "fulfilled"
        const fulfillmentStatusFormatted = rawFulfillmentStatus.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
        
        let orderStatus = order.status || "pending"
        if (name === "order.canceled") orderStatus = "canceled"
        if (name === "order.completed") orderStatus = "completed"
        
        let shipmentStatus = "Pending"
        const trackingNumbers: string[] = []
        const trackingLinks: string[] = []
        
        if (order.fulfillments && order.fulfillments.length > 0) {
            const shippedFulfillments = order.fulfillments.filter((f: any) => f.shipped_at && !f.canceled_at)
            if (shippedFulfillments.length > 0) {
                shipmentStatus = "Shipped"
                for (const f of shippedFulfillments) {
                    if (f.labels && f.labels.length > 0) {
                        for (const l of f.labels) {
                            if (l.tracking_number) {
                                trackingNumbers.push(l.tracking_number)
                                if (l.tracking_url) {
                                    trackingLinks.push(`[${l.tracking_number}](${l.tracking_url})`)
                                } else {
                                    trackingLinks.push(l.tracking_number)
                                }
                            }
                        }
                    }
                }
            } else if (order.fulfillments.some((f: any) => !f.canceled_at)) {
                shipmentStatus = "Fulfillment Created"
            }
        }

        let calculatedTotal = Number(order.total)
        if (calculatedTotal === 0 && order.summary?.original_order_total) {
            calculatedTotal = Number(order.summary.original_order_total)
        } else if (calculatedTotal === 0 && Number(order.subtotal) > 0) {
            calculatedTotal = Number(order.subtotal)
        }

        const dataForTemplate = {
            ...order,
            total: calculatedTotal,
            status: orderStatus,
            payment_status: paymentStatusFormatted,
            fulfillment_status: fulfillmentStatusFormatted,
            shipment_status: shipmentStatus,
            tracking_numbers: trackingNumbers.join(", ") || "N/A",
            tracking_links: trackingLinks.join(", ") || "N/A",
            thumbnail: order.items?.[0]?.thumbnail || "",
        }

        const currency = order.currency_code.toUpperCase()
        
        // Use proper locale formatting based on the currency code
        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
        })
        
        const formattedTotal = formatter.format(calculatedTotal)
        
        const itemsDescription = order.items
            ?.map((item: any) => {
                const qty = item.quantity !== undefined ? ` (Qty: ${item.quantity})` : ""
                const price = item.unit_price !== undefined ? ` - ${formatter.format(Number(item.unit_price))}` : ""
                return `- ${item.title}${qty}${price}`
            })
            .join("\n") || "No items listed."

        let orderStatusEmoji = "🟡"
        let color = 3447003 // Blue for placed
        if (orderStatus === "completed") {
            orderStatusEmoji = "🟢"
            color = 3066993 // Green
        } else if (orderStatus === "canceled") {
            orderStatusEmoji = "🔴"
            color = 15158332 // Red
        } else if (shipmentStatus === "Shipped") {
            color = 15105570 // Orange
        }

        const orderStatusStr = `${orderStatus.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} ${orderStatusEmoji}`

        let paymentStatusEmoji = "🟡"
        if (rawPaymentStatus === "captured") paymentStatusEmoji = "🟢"
        if (rawPaymentStatus === "refunded") paymentStatusEmoji = "🔴"
        const paymentStatusStr = `${paymentStatusFormatted} ${paymentStatusEmoji}`

        let fulfillmentEmoji = "🔴"
        if (rawFulfillmentStatus === "fulfilled") fulfillmentEmoji = "🟢"
        else if (rawFulfillmentStatus === "partially_fulfilled") fulfillmentEmoji = "🟡"

        let shipmentStr = "Pending 📦"
        if (shipmentStatus === "Shipped") {
            shipmentStr = "Shipped 🚚"
            if (trackingNumbers.length > 0) {
                shipmentStr += `\n**Tracking:** ${trackingLinks.join(", ")}`
            }
        } else if (shipmentStatus === "Fulfillment Created") {
            shipmentStr = "Fulfillment Created 📦"
        }

        const defaultEmbed: any = {
            title: `📦 Order #${order.display_id || order.id.slice(-6).toUpperCase()}`,
            color: color,
            fields: [
                { name: "Order Status", value: orderStatusStr, inline: true },
                { name: "Payment Status", value: paymentStatusStr, inline: true },
                { name: "Fulfillment Status", value: `${fulfillmentStatusFormatted} ${fulfillmentEmoji}`, inline: true },
                { name: "Shipment / Delivery", value: shipmentStr, inline: false },
                { name: "Customer Info", value: `${order.shipping_address?.first_name || order.customer?.first_name || ""} ${order.shipping_address?.last_name || order.customer?.last_name || ""} (${order.email || "N/A"})`, inline: false },
                { name: "Total Amount", value: `**${formattedTotal}**`, inline: true },
                { name: "Items Ordered", value: itemsDescription, inline: false }
            ],
            timestamp: new Date().toISOString(),
            footer: { text: globalSettings.footer_text || "Medusa Storefront" }
        }

        // Add thumbnail if the first item has one
        if (order.items?.[0]?.thumbnail) {
            defaultEmbed.thumbnail = { url: order.items[0].thumbnail }
        }

        const buildPayload = (template: string | null, botName?: string) => {
            const resolvedBotName = botName || discordSvc.getDefaultBotName()
            if (template) {
                const content = compileTemplate(template, dataForTemplate)
                // Try parsing the template as JSON to allow users to build custom rich embeds
                try {
                    const parsedJson = JSON.parse(content)
                    return {
                        username: resolvedBotName,
                        ...(globalSettings.avatar_url ? { avatar_url: globalSettings.avatar_url } : {}),
                        ...parsedJson
                    }
                } catch (e) {
                    // Not JSON, send as plain text
                    return {
                        username: resolvedBotName,
                        ...(globalSettings.avatar_url ? { avatar_url: globalSettings.avatar_url } : {}),
                        content: content
                    }
                }
            } else {
                return {
                    username: resolvedBotName,
                    ...(globalSettings.avatar_url ? { avatar_url: globalSettings.avatar_url } : {}),
                    embeds: [defaultEmbed]
                }
            }
        }

        // 1. EDIT EXISTING MESSAGES SENT FOR THIS ORDER
        const existingMessages = await discordSvc.listDiscordOrderMessages({
            order_id: orderId,
        })

        const activeWebhookUrls = new Set<string>()

        if (existingMessages && existingMessages.length > 0) {
            await Promise.all(
                existingMessages.map(async (msg: any) => {
                    activeWebhookUrls.add(msg.webhook_url)

                    // Find if there is an active mapping for this URL
                    const mappings = await discordSvc.listDiscordWebhookMappings({
                        webhook_url: msg.webhook_url,
                        is_active: true,
                    })

                    if (!mappings || mappings.length === 0) {
                        return // mapping disabled or deleted
                    }

                    // Choose template: use current event's template, or any template from active mappings on this URL
                    const currentEventMapping = mappings.find((m: any) => m.event_name === name)
                    const template = currentEventMapping?.message_template || 
                                     mappings.find((m: any) => m.message_template)?.message_template || 
                                     null
                    const botName = currentEventMapping?.bot_name ||
                                    mappings.find((m: any) => m.bot_name)?.bot_name ||
                                    undefined

                    const editPayload = buildPayload(template, botName)

                    try {
                        const response = await fetch(`${msg.webhook_url}/messages/${msg.message_id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(editPayload),
                        })

                        if (response.status === 404) {
                            // Message was deleted on Discord, clear mapping record
                            await discordSvc.deleteDiscordOrderMessages(msg.id)
                            activeWebhookUrls.delete(msg.webhook_url) // trigger a new post below
                        } else if (!response.ok) {
                            const err = await response.text()
                            logger.error(`Failed to edit Discord message ${msg.message_id}: ${response.status} - ${err}`)
                        }
                    } catch (e) {
                        logger.error(`Error editing Discord message ${msg.message_id}: ${e}`)
                    }
                })
            )
        }

        // 2. SEND NEW MESSAGES FOR NEW MAPPINGS TRIGGERED BY THIS EVENT
        const mappingsForEvent = await discordSvc.listDiscordWebhookMappings({
            event_name: name,
            is_active: true,
        })

        if (mappingsForEvent && mappingsForEvent.length > 0) {
            await Promise.all(
                mappingsForEvent.map(async (mapping: any) => {
                    // Only post a new message if we haven't already edited a message on this URL
                    if (activeWebhookUrls.has(mapping.webhook_url)) {
                        return
                    }

                    const newPayload = buildPayload(mapping.message_template, mapping.bot_name || undefined)

                    try {
                        const response = await fetch(`${mapping.webhook_url}?wait=true`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(newPayload),
                        })

                        if (!response.ok) {
                            const err = await response.text()
                            logger.error(`Failed sending Discord webhook to channel ${mapping.channel_name || "unnamed"}: ${response.status} - ${err}`)
                            return
                        }

                        const responseData = await response.json()
                        if (responseData && responseData.id) {
                            // Store the reference
                            await discordSvc.createDiscordOrderMessages({
                                order_id: orderId,
                                webhook_url: mapping.webhook_url,
                                message_id: responseData.id,
                            })
                        }
                    } catch (e) {
                        logger.error(`Error posting new Discord webhook: ${e}`)
                    }
                })
            )
        }

    } catch (err) {
        logger.error(`Error executing Discord notification subscriber: ${err}`)
    }
}

export const config: SubscriberConfig = {
    event: [
        "order.placed",
        "order.completed",
        "order.canceled",
        "order.updated",
        "order.fulfillment_created",
        "fulfillment.created",
        "fulfillment.shipment_created",
        "shipment.created",
        "customer.created",
        "customer.updated",
        "payment.captured",
        "payment.refunded"
    ],
}
