import os; os.makedirs('shots', exist_ok=True)
import asyncio
from playwright.async_api import async_playwright
from seed import seed
async def main():
    seed()
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1440,'height':900})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:5173/#report'); await pg.wait_for_selector('.week-label')
        print('today btn disabled:', await pg.locator('.week-today').is_disabled())
        await pg.click('.week-label'); await pg.wait_for_selector('.week-cal')
        await pg.locator('.week-cal-grid tbody tr').nth(1).hover()
        await pg.screenshot(path='shots/w_cal.png', clip={'x':700,'y':60,'width':740,'height':480})
        print('future disabled:', await pg.locator('.week-cal-grid button:disabled').count())
        await pg.click('.week-cal button[aria-label="이전 달"]'); print('month:', await pg.inner_text('.week-cal-head strong'))
        await pg.locator('.week-cal-grid tbody tr').nth(2).locator('button').nth(3).click()
        await pg.wait_for_timeout(300)
        print('picked:', await pg.inner_text('.week-label strong'), '| cal open:', await pg.locator('.week-cal').count(), '| today enabled:', not await pg.locator('.week-today').is_disabled())
        await pg.click('.week-today'); await pg.wait_for_timeout(200); print('back:', await pg.inner_text('.week-label'))
        await pg.click('.week-label'); await pg.keyboard.press('Escape'); print('esc closed:', await pg.locator('.week-cal').count()==0)
        m=await b.new_page(viewport={'width':390,'height':844})
        await m.goto('http://localhost:5173/#report'); await m.wait_for_selector('.week-label'); await m.click('.week-label'); await m.wait_for_selector('.week-cal')
        await m.screenshot(path='shots/w_cal_m.png')
        print('sw', await m.evaluate('document.documentElement.scrollWidth'), 'errors', errs)
        await b.close()
asyncio.run(main())
