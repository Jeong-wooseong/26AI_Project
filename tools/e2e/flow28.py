import os; os.makedirs('shots', exist_ok=True)
import asyncio
from playwright.async_api import async_playwright
from seed import seed, api
async def main():
    seed()
    for t,l in [('리포트가 비어 있어요','주간 리포트'),('말투 질문','매장 설정'),('답글이 안 만들어져요','답글 생성')]:
        api('POST','/api/support/inquiries',{'type':'BUG','title':t,'content':'내용','location':l})
    api('PATCH','/api/admin/inquiries/1',{'status':'ANSWERED','answer':'확인했습니다.'})
    api('PATCH','/api/admin/inquiries/2',{'status':'IN_PROGRESS','answer':None})
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1440,'height':960})
        await pg.goto('http://localhost:5173/#support/mine'); await pg.wait_for_selector('.inq-filter')
        for k in ['전체','답변 대기','답변 완료']:
            await pg.click(f'.inq-filter button:has-text("{k}")')
            print(k, await pg.locator('.inquiry').count(), [t.split('\n')[1] for t in await pg.locator('.inquiry-top').all_inner_texts()])
        await pg.click('.inq-filter button:has-text("답변 대기")')
        await pg.locator('.my-inquiries').screenshot(path='shots/s_inq.png')
        m=await b.new_page(viewport={'width':390,'height':844})
        await m.goto('http://localhost:5173/#support/mine'); await m.wait_for_selector('.inq-filter')
        await m.locator('.my-inquiries').screenshot(path='shots/s_inq_m.png')
        print('sw', await m.evaluate('document.documentElement.scrollWidth'))
        await b.close()
asyncio.run(main())
