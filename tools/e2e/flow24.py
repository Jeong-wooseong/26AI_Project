import os; os.makedirs('shots', exist_ok=True)
import asyncio, sys, datetime
from playwright.async_api import async_playwright
sys.path.insert(0,'.')
from seed import seed, api
O='shots/'
async def main():
    s=seed()
    today=datetime.date.today(); mon=today-datetime.timedelta(days=today.weekday()); prev=mon-datetime.timedelta(days=7)
    d=lambda n, base=mon: (base+datetime.timedelta(days=n)).isoformat()
    api('POST',f"/api/stores/{s['id']}/reviews",{'platform':'YOGIYO','reviews':[
        {'rating':5,'content':'커피 향이 진해요','writtenAt':d(0)},{'rating':3,'content':'포장이 조금 샜어요','writtenAt':d(1)},
        {'rating':4,'content':'직원분이 친절해요','writtenAt':d(1)},{'rating':2,'content':'배달이 늦고 음료가 미지근했어요','writtenAt':d(2)},
        {'rating':5,'content':'디저트가 맛있어요','writtenAt':d(2)},{'rating':4,'content':'자리가 넓어요','writtenAt':d(0, prev)},
        {'rating':5,'content':'라떼 최고','writtenAt':d(2, prev)},{'rating':3,'content':'보통이에요','writtenAt':d(3, prev)}]})
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1440,'height':1000})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:5173/#report'); await pg.wait_for_selector('.summary-5')
        await pg.locator('.col').nth(2).hover(); await pg.wait_for_timeout(200)
        await pg.screenshot(path=O+'rep_top.png')
        await pg.locator('.line-chart svg').hover(position={'x':300,'y':100}); await pg.wait_for_timeout(200)
        await pg.screenshot(path=O+'rep_line.png', clip={'x':880,'y':380,'width':540,'height':380})
        await pg.click('button:has-text("AI 분석 만들기")'); await pg.wait_for_selector('.insight-cols', timeout=15000)
        await pg.locator('.rp-insight').scroll_into_view_if_needed(); await pg.wait_for_timeout(200)
        await pg.screenshot(path=O+'rep_full.png', full_page=True)
        await pg.click('text=표로 보기'); await pg.wait_for_timeout(200); print('table rows', await pg.locator('.trend-table tbody tr').count())
        await pg.click('.switch'); await pg.wait_for_timeout(200); print('deltas after compare off', await pg.locator('.summary-5 .delta').count())
        await pg.click('.switch')
        await pg.locator('.rep-cards .text-link').first.click(); await pg.wait_for_selector('.review-item[aria-current=true]')
        print('focused:', await pg.evaluate('location.hash'), '|', await pg.locator('.review-item[aria-current=true] .item-text').inner_text(), '| tab', await pg.locator('.seg-btn[aria-pressed=true]').inner_text())
        print('errors', errs); await b.close()
asyncio.run(main())
