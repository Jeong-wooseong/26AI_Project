import os; os.makedirs('shots', exist_ok=True)
import asyncio, sys
from playwright.async_api import async_playwright
sys.path.insert(0,'.')
from seed import seed
async def main():
    seed()
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1440,'height':1000})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:5173/#reviews/wait'); await pg.wait_for_selector('.review-item')
        q=pg.locator('.review-item')
        print('queue', await q.count(), '| visible threads', await pg.locator('.detail-panel .thread:visible').count())
        # 4th item (불만, 초안 없음) -> generate
        await q.nth(3).click(); d=pg.locator('.detail-panel .thread:visible')
        print('selected text:', await d.locator('blockquote').inner_text())
        await d.locator('button:has-text("답글 초안 생성")').click()
        await q.nth(0).click(); await pg.wait_for_timeout(4000)
        await q.nth(3).click(); await pg.wait_for_timeout(300)
        print('drafts after switching back:', await pg.locator('.detail-panel .thread:visible .tone-tab').count(), '| item state:', await q.nth(3).locator('.item-state').inner_text())
        await pg.locator('.detail-panel .thread:visible .tone-tab').nth(1).click()
        await pg.locator('.detail-panel .thread:visible button:has-text("작성 완료")').last.click(); await pg.wait_for_timeout(600)
        print('after complete -> selected:', await pg.locator('.review-item[aria-current=true] .item-text').inner_text(), '| queue', await q.count())
        await pg.click('.type-tab:has-text("불만")'); await pg.wait_for_timeout(200)
        print('complaint filter queue:', await q.count(), [await t.inner_text() for t in await pg.locator('.type-tab[aria-pressed=true]').all()])
        await pg.screenshot(path='shots/flow22.png')
        print('errors', errs); await b.close()
asyncio.run(main())
