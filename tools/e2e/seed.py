import json, urllib.request, datetime
def api(method, path, body=None):
    req=urllib.request.Request('http://localhost:8080'+path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type':'application/json','X-XSRF-TOKEN':'xsrf-ok'})
    return json.loads(urllib.request.urlopen(req).read() or 'null')
def seed():
    api('POST','/__reset'); api('POST','/__reset_auth')
    api('POST','/api/auth/signup',{'email':'o@t.com','name':'김사장','password':'pass1234','passwordConfirm':'pass1234','agreeTerms':True,'agreePrivacy':True})
    api('POST','/api/auth/verify',{'token':'tok-o@t.com'}); api('POST','/api/auth/login',{'email':'o@t.com','name':'김사장','password':'pass1234','remember':False})
    s = api('POST','/api/stores',{'name':'달빛카페','category':'카페','info':'원두는 매일 아침 직접 로스팅합니다.'})
    api('PUT',f"/api/stores/{s['id']}/tone-profile",{'toneProfile':{'formality':'해요체','emojiLevel':'가끔','emojiExamples':['😊'],'length':'2~3문장','phrases':['감사드려요','보답할게요'],'closing':'오늘도 좋은 하루 되세요!'},'sampleReplies':['찾아주셔서 감사해요! 다음에도 맛있는 라떼로 보답할게요 😊','소중한 리뷰 감사드려요.','방문해 주셔서 고마워요.']})
    today = datetime.date.today(); mon = today - datetime.timedelta(days=today.weekday()); prev = mon - datetime.timedelta(days=7); d=lambda x:x.isoformat()
    api('POST',f"/api/stores/{s['id']}/reviews",{'platform':'COUPANG_EATS','reviews':[
        {'rating':2,'content':'양이 너무 적어요','writtenAt':d(prev)},{'rating':1,'content':'배달이 한 시간 넘게 걸려서 다 식었어요','writtenAt':d(prev)},{'rating':4,'content':'맛있어요','writtenAt':d(prev)}]})
    rs = api('POST',f"/api/stores/{s['id']}/reviews",{'platform':'BAEMIN','reviews':[
        {'rating':5,'content':'라떼 거품이 부드러워요. 매장 분위기도 조용해서 공부하기 좋았어요'},{'rating':2,'content':'배달이 너무 늦어요'},{'rating':5,'content':''},{'rating':1,'content':'이 가게 망해라'},{'rating':4,'content':'케이크가 촉촉하고 맛있어요'}]})
    # 하나는 작성 완료로
    r0 = api('POST', f"/api/reviews/{rs[0]['id']}/replies")
    pick = [p for p in r0['replies'] if p['tone']=='FRIENDLY'][0]
    api('PUT', f"/api/reviews/{rs[0]['id']}/final-reply", {'replyId':pick['id'],'content':pick['content'],'confirmed':False})
    api('POST', f"/api/reviews/{rs[4]['id']}/replies")
    return s
