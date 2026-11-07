import os; os.makedirs('shots', exist_ok=True)
import asyncio, sys
from playwright.async_api import async_playwright
sys.path.insert(0,'.')
from seed import seed, api
O='shots/'
async def main():
    seed()
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1440,'height':900})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:5173/#setup'); await pg.wait_for_selector('.setup-guide')
        print('save bar initially:', await pg.locator('.save-bar').count())
        await pg.click('.option-row:has-text("기본 답글 유형") .seg-btn:has-text("친근형")')
        await pg.click('.option-row:has-text("이모지 사용") .seg-btn:has-text("자주")')
        await pg.click('.option-row:has-text("중복 답글 방지") .switch')
        await pg.wait_for_timeout(200)
        print('save bar:', await pg.locator('.save-bar p').inner_text(), '| changed note:', await pg.locator('.learned-tag.is-changed').all_inner_texts())
        await pg.screenshot(path=O+'setup_dirty.png')
        await pg.click('.save-bar button:has-text("답글 스타일 저장")'); await pg.wait_for_timeout(500)
        print('after save bar:', await pg.locator('.save-bar').count(), '| store:', api('GET','/api/stores')[0]['replySettings'], api('GET','/api/stores')[0]['toneProfile']['emojiLevel'])
        # 오늘의 리뷰: 기본 말투 친근형이 먼저 열림
        await pg.goto('http://localhost:5173/#reviews'); await pg.wait_for_selector('.tone-tab')
        print('default tab:', await pg.locator('.thread:visible .tone-tab[aria-checked=true]').inner_text())
        await pg.click('button:has-text("답글 일괄 처리")'); await pg.wait_for_timeout(200)
        print('bulk tone:', await pg.locator('.bulk-tones .chip.is-on').inner_text())
        # 다시 학습 → 저장 전 상태
        await pg.goto('http://localhost:5173/#setup'); await pg.wait_for_selector('.setup-guide')
        await pg.click('button:has-text("다시 학습하기")'); await pg.wait_for_selector('.learn-state.is-pending, .learn-state.is-done', timeout=10000)
        print('relearn state:', await pg.locator('.learn-state').inner_text(), '| bar', await pg.locator('.save-bar').count())
        m=await b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2)
        await m.goto('http://localhost:5173/#setup'); await m.wait_for_selector('.setup-guide'); await m.wait_for_timeout(400)
        await m.screenshot(path=O+'m_setup.png', full_page=True)
        print('errors', errs); await b.close()
asyncio.run(main())
