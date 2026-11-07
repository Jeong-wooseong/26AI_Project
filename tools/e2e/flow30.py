import os; os.makedirs('shots', exist_ok=True)
import asyncio
from playwright.async_api import async_playwright
from seed import seed, api
O='shots/'
async def main():
    st=seed()
    rv=api('GET',f"/api/stores/{st['id']}/reviews")
    reps=[p for r in rv for p in r['replies']]
    api('PUT',f"/api/replies/{reps[0]['id']}/feedback",{'value':'DOWN','reasons':['AWKWARD_TONE','LENGTH'],'comment':'너무 딱딱하고 짧아요. 3~4문장으로 해 줬으면 해요.'})
    api('PUT',f"/api/replies/{reps[1]['id']}/feedback",{'value':'DOWN','reasons':['CONTENT_MISMATCH'],'comment':''})
    api('PUT',f"/api/replies/{reps[2]['id']}/feedback",{'value':'UP'})
    api('POST','/api/support/inquiries',{'type':'BUG','title':'문의','content':'내용','location':'기타'})
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1440,'height':900})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:5173/#admin/feedback'); await pg.wait_for_selector('.ap-table tbody tr')
        print('down rows', await pg.locator('.ap-table tbody tr').count())
        await pg.select_option('.ap-toolbar select','LENGTH'); await pg.wait_for_timeout(300); print('LENGTH rows', await pg.locator('.ap-table tbody tr').count())
        await pg.select_option('.ap-toolbar select',''); await pg.wait_for_timeout(300)
        await pg.locator('.ap-table tbody tr').first.click(); await pg.wait_for_selector('.fb-box')
        await pg.screenshot(path=O+'fb.png')
        await pg.click('.seg-btn:has-text("마음에 들어요")'); await pg.wait_for_timeout(300); print('up rows', await pg.locator('.ap-table tbody tr').count())
        await pg.goto('http://localhost:5173/#reviews'); await pg.wait_for_selector('.summary-progress'); await pg.wait_for_timeout(500)
        await pg.locator('.summary').screenshot(path=O+'prog.png')
        await pg.locator('.review-panel').screenshot(path=O+'queue.png')
        await pg.goto('http://localhost:5173/#support/mine'); await pg.wait_for_selector('.inq-filter')
        await pg.locator('.my-inquiries').screenshot(path=O+'inq2.png')
        print('errors', errs); await b.close()
asyncio.run(main())
