import os; os.makedirs('shots', exist_ok=True)
import asyncio, json, urllib.request
from playwright.async_api import async_playwright
OUT='shots/'; B='http://localhost:5173'
def api(method, path, body=None):
    req=urllib.request.Request('http://localhost:8080'+path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type':'application/json','X-XSRF-TOKEN':'xsrf-ok'})
    return json.loads(urllib.request.urlopen(req).read() or 'null')
async def main():
    api('POST','/__reset'); api('POST','/__reset_auth')
    api('POST','/api/auth/signup',{'email':'o@t.com','name':'김사장','password':'pass1234','passwordConfirm':'pass1234','agreeTerms':True,'agreePrivacy':True})
    api('POST','/api/auth/verify',{'token':'tok-o@t.com'}); api('POST','/api/auth/login',{'email':'o@t.com','name':'김사장','password':'pass1234','remember':False})
    s = api('POST','/api/stores',{'name':'달빛카페','category':'카페'})
    api('PUT',f"/api/stores/{s['id']}/tone-profile",{'toneProfile':{'formality':'해요체','emojiLevel':'가끔','emojiExamples':['😊'],'length':'2~3문장','phrases':[],'closing':''},'sampleReplies':['a','b','c']})
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':1000})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B+'/#input'); await pg.wait_for_selector('.mode-cards'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=OUT+'1_empty.png')
        # 원 중앙 정렬 측정
        for el in await pg.locator('.flow-step-no').all():
            bb = await el.bounding_box(); t = await el.evaluate("e => { const r=document.createRange(); r.selectNodeContents(e); const x=r.getBoundingClientRect(); return [x.left+x.width/2, x.top+x.height/2] }")
            print('circle', round(bb['x']+bb['width']/2,1), round(bb['y']+bb['height']/2,1), 'text', [round(v,1) for v in t], 'size', bb['width'], bb['height'])
        await pg.click('button:has-text("등록 및 분류")'); await pg.wait_for_timeout(200); print('empty submit:', await pg.inner_text('.alert'))
        await pg.fill('[aria-label="리뷰 1 본문"]','양이 넉넉하고 맛있어요'); await pg.keyboard.press('Enter')
        await pg.fill('[aria-label="리뷰 2 본문"]','배달이 늦었어요'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(100)
        await pg.click('button:has-text("행 추가")'); await pg.wait_for_timeout(100)
        print('rows:', await pg.locator('.entry-row').count())
        await pg.click('button:has-text("등록 및 분류")'); await pg.wait_for_timeout(200); print('missing:', await pg.inner_text('.alert'))
        await pg.screenshot(path=OUT+'2_missing.png')
        await pg.locator('[aria-label="리뷰 1 별점"] [aria-label="4점"]').click()
        await pg.locator('[aria-label="리뷰 2 별점"] [aria-label="2점"]').click()
        await pg.locator('[aria-label="리뷰 3 별점"] [aria-label="5점"]').focus(); await pg.keyboard.press('ArrowLeft') if False else None
        await pg.locator('[aria-label="리뷰 3 별점"] [aria-label="5점"]').click()
        await pg.locator('[aria-label="리뷰 4 별점"] [aria-label="3점"]').hover(); await pg.wait_for_timeout(200)
        await pg.screenshot(path=OUT+'3_filled_hover.png')
        print('stats:', (await pg.inner_text('.input-count')).replace('\n',' '), '| foot:', await pg.inner_text('.input-panel-foot .hint'))
        await pg.locator('[aria-label="리뷰 4 삭제"]').click(); await pg.wait_for_timeout(80)
        print('leaving class:', await pg.locator('.entry-row.is-leaving').count()); await pg.wait_for_timeout(300)
        print('rows after delete:', await pg.locator('.entry-row').count())
        await pg.click('#input-mode-tab-paste'); await pg.wait_for_timeout(250); await pg.click('#input-mode-tab-manual'); await pg.wait_for_timeout(250)
        print('kept after tab switch:', await pg.input_value('[aria-label="리뷰 1 본문"]'))
        async def slow(route):
            await asyncio.sleep(1.5); await route.continue_()
        await pg.route('**/api/stores/*/reviews', slow)
        await pg.click('button:has-text("등록 및 분류")'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT+'4_busy.png', clip={'x':0,'y':60,'width':1440,'height':300})
        await pg.wait_for_selector('.thread', timeout=8000)
        print('registered:', await pg.locator('.thread').count())
        mp = await b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2)
        await mp.goto(B+'/#input'); await mp.wait_for_selector('.mode-cards'); await mp.fill('[aria-label="리뷰 1 본문"]','맛있어요'); await mp.locator('[aria-label="리뷰 1 별점"] [aria-label="5점"]').click()
        await mp.wait_for_timeout(300); await mp.screenshot(path=OUT+'5_mobile.png', full_page=True)
        print('errors:', errs); await b.close()
asyncio.run(main())
