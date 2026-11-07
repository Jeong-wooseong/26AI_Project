import os; os.makedirs('shots', exist_ok=True)
import asyncio, sys
from playwright.async_api import async_playwright
sys.path.insert(0,'.')
from seed import seed
O='shots/'
async def main():
    seed()
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1440,'height':1000})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:5173/#support'); await pg.wait_for_selector('.faq')
        await pg.fill('.support-search input','메일'); await pg.wait_for_timeout(200)
        print('search results:', await pg.locator('.faq li').count(), await pg.locator('.faq-panel-head .hint').inner_text())
        await pg.fill('.support-search input',''); await pg.click('.faq-tabs .type-tab:has-text("계정 및 결제")'); print('cat items:', await pg.locator('.faq li').count())
        await pg.click('.faq-q:has-text("요금")'); print('answer:', (await pg.locator('.faq-a').inner_text())[:30])
        await pg.click('.type-option:has-text("오류 제보")'); await pg.fill('.inquiry-form input[placeholder^="예: AI"]','답글이 안 만들어져요'); await pg.fill('.inquiry-form textarea','생성 버튼을 눌러도 계속 로딩됩니다.')
        await pg.click('button:has-text("문의 접수")'); await pg.wait_for_selector('.inquiry'); await pg.click('.inquiry-head'); await pg.wait_for_timeout(300)
        print('inquiry:', (await pg.locator('.inquiry-top').inner_text()).replace('\n',' '), '| hash', await pg.evaluate('location.hash'))
        await pg.screenshot(path=O+'support2.png')
        await pg.click('.helpchat-fab'); await pg.wait_for_selector('.helpchat-panel'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=O+'chat.png')
        print('errors', errs); await b.close()
asyncio.run(main())
