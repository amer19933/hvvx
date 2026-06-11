import asyncio
from telethon import TelegramClient, events
from playwright.async_api import async_playwright

# ======================
# 🔴 بيانات البوت
# ======================
API_ID = 8934899
API_HASH = "bf3e98d2c351e4ad06946b4897374a1e"
BOT_TOKEN = "8392678270:AAF35esm62cMq81jsnup9MXb3Ge2dNfcB8M"

client = TelegramClient("gift_bot", API_ID, API_HASH)


# ======================
# 🎁 جلب أرخص الهدايا (ASYNC)
# ======================
async def get_cheapest_gifts():
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            await page.goto(
                "https://fragment.com/gifts?sort=price_asc",
                timeout=60000
            )

            await page.wait_for_timeout(5000)

            rows = await page.query_selector_all("tr.tm-row-clickable")

            if not rows:
                await browser.close()
                return "❌ لا توجد هدايا حالياً أو تم الحجب"

            result = "🎁 أرخص الهدايا الحالية:\n\n"

            for row in rows[:5]:
                title = await row.query_selector(".table-cell-title")
                price = await row.query_selector(".table-cell-value")

                title_text = await title.inner_text() if title else "Unknown"
                price_text = await price.inner_text() if price else "Unknown"

                result += f"🎁 {title_text}\n"
                result += f"💰 {price_text}\n\n"

            await browser.close()
            return result

    except Exception as e:
        return f"❌ Error: {e}"


# ======================
# 🚀 أوامر البوت
# ======================
@client.on(events.NewMessage(pattern="/start"))
async def start(event):
    await event.reply(
        "👋 أهلاً بك\n\n"
        "أرسل /gifts لجلب أرخص الهدايا من Fragment"
    )


@client.on(events.NewMessage(pattern="/gifts"))
async def gifts(event):
    await event.reply("⏳ جاري جلب البيانات...")

    result = await get_cheapest_gifts()

    await event.reply(result)


# ======================
# ▶️ تشغيل البوت
# ======================
async def main():
    print("Bot Started...")

    await client.start(bot_token=BOT_TOKEN)
    await client.run_until_disconnected()


if __name__ == "__main__":
    asyncio.run(main())