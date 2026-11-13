#!/usr/bin/env python3
"""Cache verifiable ACS Nano article images for ResearchASAP."""
import json, os, pathlib, re, time, urllib.parse, urllib.request
from html.parser import HTMLParser

ROOT=pathlib.Path("data")
OUT=ROOT/"figures.json"
IMAGES=pathlib.Path("images/articles")
HEADERS={"User-Agent":"ResearchASAP/1.0 (academic article discovery; contact via GitHub repository)","Accept":"text/html,application/json,image/*,*/*"}
class Images(HTMLParser):
 def __init__(self):super().__init__();self.found=[]
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if tag=="meta":
   key=(d.get("property") or d.get("name") or "").lower()
   if key in ("og:image","twitter:image","citation_image","citation_graphical_abstract"):
    self.found.append(d.get("content",""))
  if tag=="img":
   label=" ".join(d.get(x,"") for x in ("alt","class","id")).lower()
   if any(x in label for x in ("visual abstract","graphical abstract","toc graphic")):
    self.found.append(d.get("data-src") or d.get("src") or "")
def fetch(url,limit=4000000):
 req=urllib.request.Request(url,headers=HEADERS)
 with urllib.request.urlopen(req,timeout=18) as response:
  return response.read(limit),response.headers.get("Content-Type",""),response.geturl()
def image_ext(data,content_type):
 if data.startswith(bytes.fromhex("89504e470d0a1a0a")):return "png"
 if data.startswith(bytes.fromhex("ffd8ff")):return "jpg"
 if data.startswith((b"GIF87a",b"GIF89a")):return "gif"
 if data.startswith(b"RIFF") and data[8:12]==b"WEBP":return "webp"
 return None
def latest_dois():
 query=urllib.parse.urlencode({"filter":"from-online-pub-date:2026-10-01","query.container-title":"ACS Nano","rows":50,"select":"DOI,container-title"})
 try:
  data=json.loads(fetch("https://api.crossref.org/works?"+query)[0])
  return [w["DOI"].lower() for w in data["message"]["items"] if w.get("DOI","").lower().startswith("10.1021/acsnano.") and "ACS Nano" in w.get("container-title",[])]
 except Exception as e:
  print("Crossref discovery failed:",e);return []
def get_image(doi):
 page="https://pubs.acs.org/doi/"+doi
 try:
  html,_,resolved=fetch(page)
  parser=Images();parser.feed(html.decode("utf-8","replace"))
  code=doi.split("/")[-1].replace("acsnano.","nn")
  guesses=[f"https://pubs.acs.org/cms/{doi}/asset/images/medium/{code}_0001.{ext}" for ext in ("gif","jpeg","png")]
  candidates=[urllib.parse.urljoin(resolved,url) for url in parser.found if url]+guesses
  for url in dict.fromkeys(candidates):
   if not url.startswith("https://"):continue
   host=urllib.parse.urlsplit(url).hostname or ""
   if not (host=="pubs.acs.org" or host.endswith(".acs.org")):continue
   try:
    data,ct,_=fetch(url,3000000)
    ext=image_ext(data,ct)
    if not ext or len(data)<2500:continue
    return data,ext,url
   except Exception as e:print("Image candidate failed:",str(e)[:90])
 except Exception as e:print("Publisher page unavailable",doi,str(e)[:120])
 return None
def main():
 ROOT.mkdir(exist_ok=True);IMAGES.mkdir(parents=True,exist_ok=True)
 records=json.loads(OUT.read_text().replace("\\\\n","\\n")) if OUT.exists() else {}
 dois=list(dict.fromkeys(["10.1021/acsnano.6c16642"]+latest_dois()))[:35]
 for doi in dois:
  if records.get(doi,{}).get("url","").startswith("./images/"):continue
  print("Checking",doi,flush=True)
  result=get_image(doi)
  if result:
   data,ext,source=result
   filename=doi.split("/")[-1]+"."+ext
   (IMAGES/filename).write_bytes(data)
   records[doi]={"url":"./images/articles/"+filename,"type":"Publisher article image","source":source}
   print("CACHED",doi,len(data),flush=True)
  else:print("NO IMAGE",doi,flush=True)
  time.sleep(.25)
 OUT.write_text(json.dumps(records,indent=2,ensure_ascii=False)+"\\n")
if __name__=="__main__":main()
