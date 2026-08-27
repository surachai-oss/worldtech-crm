# -*- coding: utf-8 -*-
"""หา identifier ที่ถูกใช้แต่ไม่ได้ประกาศไว้ในไฟล์ (เช่น state ที่เปลี่ยนชื่อแล้วลืมแก้ที่ใช้)
ไม่รู้จัก scope — ดูแค่ว่า 'ชื่อนี้โผล่ที่ไหนสักแห่งในไฟล์ในฐานะการประกาศหรือไม่'
พอสำหรับจับ typo/rename ที่หลุด ซึ่งเป็นบั๊กที่ทำให้ React ล้มทั้งหน้า"""
import sys,io,re,keyword

GLOBALS = set('''
window document console navigator location history localStorage sessionStorage fetch URL URLSearchParams
Math JSON Object Array String Number Boolean Date RegExp Map Set WeakMap Promise Error TypeError Intl
setTimeout clearTimeout setInterval clearInterval requestAnimationFrame queueMicrotask structuredClone
Blob File FileReader FormData Headers Response Request AbortController Image Audio Event CustomEvent
isNaN parseInt parseFloat encodeURIComponent decodeURIComponent encodeURI decodeURI btoa atob alert confirm prompt
undefined null true false NaN Infinity globalThis process import export default async await new typeof instanceof
of in as from let const var function return if else for while do switch case break continue throw try catch finally
class extends super this delete void yield static get set
React
'''.split())

def strip(s):
    out=[];i=0;n=len(s);prev=''
    while i<n:
        c=s[i]
        if c=='/' and prev in '(,=:[!&|?{;+' and i+1<n and s[i+1] not in '/*':
            j=i+1;incls=False
            while j<n:
                if s[j]=='\\': j+=2;continue
                if s[j]=='[': incls=True
                elif s[j]==']': incls=False
                elif s[j]=='/' and not incls: break
                elif s[j]=='\n': break
                j+=1
            if j<n and s[j]=='/':
                i=j+1
                while i<n and s[i].isalpha(): i+=1
                prev='x';continue
        if c=='/' and i+1<n and s[i+1]=='/':
            while i<n and s[i]!='\n': i+=1
            continue
        if c=='/' and i+1<n and s[i+1]=='*':
            i+=2
            while i+1<n and not(s[i]=='*' and s[i+1]=='/'):
                if s[i]=='\n': out.append('\n')
                i+=1
            i+=2;continue
        if c in '"\'':
            q=c;i+=1
            while i<n and s[i]!=q:
                if s[i]=='\\': i+=1
                if s[i]=='\n': out.append('\n')
                i+=1
            i+=1;out.append('""');prev='"';continue
        if c=='`':
            i+=1;out.append('""')
            while i<n and s[i]!='`':
                if s[i]=='\\': i+=2;continue
                if s[i]=='$' and i+1<n and s[i+1]=='{':
                    depth=1;i+=2;seg=[]
                    while i<n and depth:
                        if s[i]=='{':depth+=1
                        elif s[i]=='}':
                            depth-=1
                            if not depth: break
                        seg.append(s[i]);i+=1
                    out.append('('+''.join(seg)+')')
                    i+=1;continue
                if s[i]=='\n': out.append('\n')
                i+=1
            i+=1;prev='"';continue
        out.append(c)
        if not c.isspace(): prev=c
        i+=1
    return ''.join(out)

ID=r'[A-Za-z_$][\w$]*'

def declared(src):
    d=set()
    for m in re.finditer(r'\bimport\s+([\s\S]*?)\bfrom\b',src):
        for w in re.findall(ID,m.group(1)):
            if w!='as': d.add(w)
    # const/let/var/function/class + การ destructure
    for m in re.finditer(r'\b(?:const|let|var)\s+([\s\S]{0,400}?)=',src):
        d.update(re.findall(ID,m.group(1)))
    for m in re.finditer(r'\b(?:function|class)\s+('+ID+r')',src): d.add(m.group(1))
    for m in re.finditer(r'\bcatch\s*\(\s*('+ID+r')',src): d.add(m.group(1))
    for m in re.finditer(r'\bfor\s*\(\s*(?:const|let|var)\s+([\s\S]{0,120}?)\s+(?:of|in)\b',src):
        d.update(re.findall(ID,m.group(1)))
    # พารามิเตอร์ฟังก์ชันทุกแบบ: (a,b)=> / function f(a,b) / method(a,b){
    for m in re.finditer(r'\(([^()]*)\)\s*=>',src): d.update(re.findall(ID,m.group(1)))
    for m in re.finditer(r'\b('+ID+r')\s*=>',src): d.add(m.group(1))
    for m in re.finditer(r'\bfunction\s*'+ID+r'?\s*\(([^()]*)\)',src): d.update(re.findall(ID,m.group(1)))
    # props ที่ destructure ในหัวคอมโพเนนต์ ครอบด้วย {..} หลายบรรทัด
    for m in re.finditer(r'\(\s*\{([\s\S]{0,400}?)\}\s*\)\s*(?:=>|\{)',src): d.update(re.findall(ID,m.group(1)))
    return d

def used(src):
    # ตัดชื่อ tag JSX และชื่อ attribute ออก เหลือแต่ identifier ที่เป็นค่าจริงๆ
    src=re.sub(r'</?'+ID+r'','',src)
    src=re.sub(r'\b'+ID+r'\s*=(?!=)','',src)          # attr= และ assignment
    src=re.sub(r'\.\s*('+ID+r')','.',src)             # property access
    src=re.sub(r'\{\s*('+ID+r')\s*:','{',src)         # object key
    src=re.sub(r',\s*('+ID+r')\s*:',',',src)
    return set(re.findall(ID,src))

bad=0
for path in sys.argv[1:]:
    src=strip(io.open(path,encoding='utf-8').read())
    d=declared(src)|GLOBALS|set(keyword.kwlist)
    miss=sorted(w for w in used(src) if w not in d and not w[0].isupper())
    if miss:
        print(f'{path}: {", ".join(miss)}')
        bad+=len(miss)
print('NO UNDEFINED NAMES' if not bad else f'{bad} suspicious name(s) — ตรวจด้วยตา')
