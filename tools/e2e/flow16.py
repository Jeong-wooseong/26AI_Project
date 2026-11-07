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
    api('POST',f"/api/stores/{s['id']}/reviews",{'platform':'BAEMIN','reviews':[
        {'rating':5,'content':'라떼 거품이 부드러워요'},{'rating':4,'content':'케이크가 촉촉해요'},{'rating':5,'content':''},
        {'rating':2,'content':'배달이 너무 늦어요'},{'rating':1,'content':'이 가게 망해라'},{'rating':5,'content':'라떼 거품이 부드러워요'}]})
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':1000})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B+'/#reviews/wait'); await pg.wait_for_selector('.thread')
        print('wait rows:', await pg.locator('.thread').count())
        # 중복 리뷰 삭제
        row = pg.locator('.thread').first
        await row.locator('[aria-label="리뷰 삭제"]').click(); await pg.wait_for_selector('.del-pop')
        await pg.screenshot(path=OUT+'1_delete_confirm.png')
        await pg.locator('.del-pop button:has-text("삭제")').click(); await pg.wait_for_timeout(400)
        print('after delete rows:', await pg.locator('.thread').count())
        await pg.click('button:has-text("답글 일괄 처리")'); await pg.wait_for_selector('.bulk-panel')
        await pg.click('.bulk-tones label:has-text("친근형")'); await pg.check('text=불만 리뷰 포함'); await pg.check('text=악성 리뷰 포함')
        await pg.screenshot(path=OUT+'2_bulk_panel.png')
        print('target:', await pg.inner_text('.bulk-panel-foot .hint'))
        await pg.click('button:has-text("친근형으로 작성 완료")'); await pg.wait_for_selector('.bulk-progress'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT+'3_bulk_running.png')
        await pg.wait_for_selector('.bulk-result', timeout=20000); await pg.wait_for_timeout(300)
        print('result:', (await pg.inner_text('.bulk-result')).replace('\n',' | '))
        await pg.screenshot(path=OUT+'4_bulk_result.png', full_page=True)
        await pg.click('.seg-btn.is-done'); await pg.wait_for_selector('.thread.is-done'); await pg.wait_for_timeout(300)
        print('done items:', await pg.locator('.review-item').count(), '| card:', await pg.locator('.thread:visible .final-title strong').inner_text())
        await pg.screenshot(path=OUT+'5_done.png', full_page=True)
        print('errors:', errs); await b.close()
asyncio.run(main())
