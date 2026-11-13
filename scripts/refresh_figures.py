#!/usr/bin/env python3
"""Resolve publisher-supplied article images; store URLs, not copyrighted images."""
import json, re, urllib.request, urllib.parse, html, pathlib, datetime
from html.parser import HTMLParser
OUT=pathlib.Path("data/figures.json")
TEST=["10.1021/acs.joc.6c01897"]
class Meta(HTMLParser):
 def __init__(self): super().__init__(); self.images=[]
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if tag=="meta":
   k=(d.get("property") or d.get("name") or "").lower()
   if k in ("og:image","twitter:image","citation_image","dc.identifier.image","citation_graphical_abstract"): self.images.append((k,html.unescape(d.get("content",""))))
  if tag=="img":
   label=(d.get("alt","")+" "+d.get("class","")+" "+d.get("id","")).lower()
   if re.search("visual abstract|graphical abstract|toc graphic",label):self.images.append(("figure",html.unescape(d.get("src") or d.get("data-src") or "")))
def get(url,limit=1500000):
 req=urllib.request.Request(url,headers={"User-Agent":"ResearchASAP/1.0 (research paper image metadata index; GitHub Pages)","Accept":"text/html,application/json,*/*"})
 with urllib.request.urlopen(req,timeout=12) as r:return r.read(limit),r.headers.get("Content-Type","")
def resolve(doi):
 url="https://pubs.acs.org/doi/"+urllib.parse.quote(doi,safe="/") if doi.startswith("10.1021/") else "https://doi.org/"+urllib.parse.quote(doi,safe="/")
 try:
  body,_=get(url);p=Meta();p.feed(body.decode("utf-8","replace"))
  for label,img in p.images:
   img=urllib.parse.urljoin(url,img)
   host=urllib.parse.urlsplit(img).hostname or ""
   if urllib.parse.urlsplit(img).scheme!="https" or not (host.endswith("acs.org") or host.endswith("wiley.com") or host.endswith("springer.com") or host.endswith("nature.com") or host.endswith("sciencedirect.com") or host.endswith("elsevier.com") or host.endswith("rsc.org")):continue
   try:
    _,ct=get(img,400)
    if ct.lower().startswith("image/"):return {"url":img,"type":"Publisher image","source":host}
   except Exception:continue
 except Exception as e:print(doi,"publisher lookup:",str(e)[:160])
 return None
def main():
 old=json.loads(OUT.read_text()) if OUT.exists() else {}
 dois=TEST[:]
 for d in dois:
  if d in old and old[d].get("url"):continue
  result=resolve(d)
  if result:old[d]=result;print("FOUND",d,result["url"])
  else:print("NO VERIFIED IMAGE",d)
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps(old,indent=2,ensure_ascii=False)+"\n")
if __name__=="__main__":main()
