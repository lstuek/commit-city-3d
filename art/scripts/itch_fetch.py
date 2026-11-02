import sys, re, json, urllib.request, urllib.parse, http.cookiejar, os
user, slug, outdir = sys.argv[1:4]
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.addheaders=[('User-Agent','Mozilla/5.0')]
base=f"https://{user}.itch.io/{slug}"
def get(u): return op.open(u,timeout=60).read().decode('utf8','replace')
def post(u,d):
    return op.open(urllib.request.Request(u,urllib.parse.urlencode(d).encode()),timeout=60).read().decode()
tok=lambda h: re.search(r'name="csrf_token" value="([^"]*)"',h).group(1)
h=get(base)
d=json.loads(post(base+"/download_url",{'csrf_token':tok(h)}))['url']
h2=get(d)
t=tok(h2)
# list uploads
for m in re.finditer(r'data-upload_id="(\d+)"',h2):
    uid=m.group(1)
    seg=h2[m.start()-1500:m.start()+1500]
    name=re.findall(r'title="([^"]+\.(?:zip|rar|7z))"',seg)
    print(uid,name, re.findall(r'<span class="file_size"><span>([^<]*)',seg))
if len(sys.argv)>4:
    uid=sys.argv[4]
    r=json.loads(post(f"{base}/file/{uid}?source=game_download&as_props=1&after_download_lightbox=true",{'csrf_token':t}))
    os.makedirs(outdir,exist_ok=True)
    data=op.open(r['url'],timeout=300).read()
    open(os.path.join(outdir,'pack.zip'),'wb').write(data); print('saved',len(data))
