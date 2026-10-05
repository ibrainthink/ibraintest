export const DOMAINS=[
{label:'수',aliases:['수영역','수감각','수개념','수와연산','수학','number','su','수']},
{label:'공간·도형',aliases:['공간도형','공간','도형','space']},
{label:'규칙·추론',aliases:['규칙추론','규칙','추론','logic']},
{label:'관찰·분류',aliases:['관찰분류','관찰','분류','observe']},
{label:'문제해결',aliases:['문제해결력','문제해결','problem']},
{label:'언어표현',aliases:['언어표현','언어','language']}];
export function classifyFilename(name){
 const stem=name.normalize('NFKC').replace(/\.pdf$/i,'');
 const compact=stem.toLowerCase().replace(/[\s_\-\.\(\)\[\]]/g,'');
 const tokens=stem.toLowerCase().split(/[^a-z가-힣]+/).filter(Boolean);
 const domain=DOMAINS.find(d=>d.aliases.some(a=>(a==='수'||/^[a-z]+$/.test(a))?tokens.includes(a):compact.includes(a)));
 const runs=stem.match(/[★⭐☆🌟]+/gu)||[];
 const explicit=stem.match(/(?:별|star|난이도)\s*[_\-:]?\s*(\d{1,2})|([1-9])\s*(?:별|성|stars?)/i);
 let stars=explicit?Number(explicit[1]||explicit[2]):null;
 if(stars==null&&runs.length)stars=Math.max(...runs.map(r=>[...r].filter(c=>c!=='☆').length));
 if(!stars)stars=null;
 return{domain:domain?.label||'미분류',stars};
}