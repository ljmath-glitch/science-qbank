/* 題目品質關 v0.1：純函式，不讀取 DOM 或全域題庫資料。 */
(function(root){
  const text=v=>v==null?'':String(v);
  const norm=v=>{const s=text(v);return s.normalize?s.normalize('NFKC').replace(/[（）［］]/g,c=>c==='（'?'(':c==='）'?')':c==='［'?'[':']'):s;};
  const answer=v=>norm(v).replace(/[\s,，、()（）.．]/g,'').toUpperCase().replace(/[○✕×]/g,c=>c==='○'?'O':'X');
  const validImg=new Set(['圖','表','圖表','圖片','照片','示意圖','流程圖','電路圖','實驗圖','無']);
  // Do not use \b here: it does not see a boundary between CJK text and A.
  const marker=/(?:\(([A-E])\)|(?<![A-Za-z0-9])([A-E])\s*[\.．、])/g, imageRef=/附圖|如圖|下圖|右圖|左圖|上圖|附表|如下表|表\s*[一二三四五六七八九十0-9]+|如表|見圖|圖\s*[（(]?[一二三四五六七八九十0-9A-Za-z]+[）)]?|示意圖|如[右左上下]圖/, noun=/電路圖|流程圖|長條圖|圓餅圖/;
  function options(s){s=norm(s);let m=[...s.matchAll(marker)],best=[];for(let i=0;i<m.length;i++){if((m[i][1]||m[i][2]).toUpperCase()!=='A')continue;let run=[m[i]],e=66;for(let j=i+1;j<m.length;j++){let l=(m[j][1]||m[j][2]).toUpperCase();if(l.charCodeAt(0)===e){run.push(m[j]);e++}else if(l==='A')break}if(run.length>=2&&run.length>=best.length)best=run}return Object.fromEntries(best.map((x,i)=>[(x[1]||x[2]).toUpperCase(),s.slice(x.index+x[0].length,i+1<best.length?best[i+1].index:s.length).trim()]));}
  function kindOf(q,p){let k=norm(q['題型']).toLowerCase();if(/填充|計算|非選|問答|簡答|作答/.test(k))return'nonchoice';if(/是非|判斷/.test(k))return'truefalse';if(/複選|多選/.test(k))return'multiple';let sem=Object.values(p).map(x=>norm(x).replace(/[\s,，、.．:：;；()\[\]{}「」『』]/g,'').toUpperCase().replace(/[○✕×]/g,c=>c==='○'?'O':'X'));if(!k.trim()&&Object.keys(p).length===2&&sem.some(x=>['正確','是','對','O','T','TRUE','YES'].includes(x))&&sem.some(x=>['錯誤','否','錯','X','F','FALSE','NO'].includes(x)))return'truefalse';return(/選擇|單選/.test(k)||Object.keys(p).length)?'choice':'nonchoice';}
  function checkFields(q,ctx){let f=[],body=norm(q['題目']),type=norm(q['圖表類型']).trim(),bad=!validImg.has(type)||type==='無',needsImage=imageRef.test(body)||(type&&type!=='無');
    // ctx.hasImage 僅由主題庫提供；未提供時維持 review.html 原先的圖表類型規則。
    if(needsImage&&ctx&&ctx.hasImage===false)f.push(['block','missing_image','題目提及圖／表或標示圖表類型，但沒有圖片。']);
    else if(ctx&&ctx.hasImage===true){/* 主題庫確認有圖，不再依圖表類型欄報缺圖 */}
    else if(imageRef.test(body)&&bad)f.push(['block','missing_image','題目提及圖／表，但圖表類型為空、無或非法值。']);
    else if(noun.test(body)&&bad)f.push(['warn','possible_missing_image','題目僅出現圖表名詞，可能需附圖。']);
    let p=options(body),kind=kindOf(q,p),a=answer(q['答案']);if(['choice','multiple','truefalse'].includes(kind)){let allowed=kind==='truefalse'?'OXTFAB':Object.keys(p).join('')||'ABCDE';if(kind!=='truefalse'){let need=p.E?'ABCDE':'ABCD';if(!Object.keys(p).length||[...need].some(x=>!text(p[x]).trim()))f.push(['block','incomplete_options','選項缺少或內容為空。']);}if(!a)f.push(['block','missing_answer','答案為空。']);else if([...a].some(x=>!allowed.includes(x))||(kind!=='multiple'&&a.length!==1))f.push(['block','answer_out_of_range',`答案「${a}」不在選項範圍 ${allowed}。`]);}else if(!a)f.push(['block','missing_answer','答案為空。']);for(const [field,value] of [['題目',q['題目']],['題組文章',q['題組文章']],['詳解',q['詳解']]]){let raw=text(value),x=norm(value);if(/試題結束|本卷結束|背面尚有試題|請翻頁|第\s*\d+\s*頁/.test(x))f.push(['warn','exam_end_noise',`${field}含考卷版面雜訊。`]);if(/^\s*-\s*\d+\s*-\s*$/m.test(x))f.push(['warn','page_number_noise',`${field}含獨立頁碼樣式。`]);if(/(?:^|\n)\s*\(\s*\d+\s*-\s*\d+\s*\)(?=\s|$)|(?:^|\s)\(\s*\d+\s*-\s*\d+\s*\)\s*(?:$|\n)/m.test(x))f.push(['warn','page_label_noise',`${field}含行首或行尾頁面標籤。`]);if(/圖[一二三四五六七八九十]+(?:圖[一二三四五六七八九十]+)+\s*[。．]?$/.test(x))f.push(['warn','trailing_figure_labels',`${field}題末有連黏圖號。`]);if(/(?:\\times|×|x)\s*10[1-9]\d+/i.test(raw))f.push(['warn','flattened_exponent',`${field}疑似次方壓平。`]);if(/(?<![A-Za-z0-9])(?:cm|m)(?:2|3)(?!\d)|m\s*\/\s*s\s*2(?!\d)/i.test(raw))f.push(['warn','flattened_square_unit',`${field}疑似單位上標遺失。`]);if(/(?<![A-Za-z0-9])(?:MnO2|H2O|CO2|SO4)(?![A-Za-z0-9])/i.test(raw)||/(?<![A-Za-z0-9])(?:I|R|V|Q|x|y|z)\d+(?![A-Za-z0-9])/.test(raw))f.push(['warn','flattened_subscript',`${field}疑似化學式或變數下標壓平。`]);if(/[\uFFFD\uE000-\uF8FF]/.test(raw))f.push(['warn','garbled_text',`${field}含無法辨識的亂碼。`]);if(/(?<![A-Za-z0-9])[@#$~](?![A-Za-z0-9])/.test(raw))f.push(['warn','isolated_symbol',`${field}含孤立符號。`]);if(/[!?！？]{2,}|[,，;；:：]{2,}|[。．]{2,}/.test(raw))f.push(['warn','repeated_punctuation',`${field}含重複標點。`]);}let article=norm(q['題組文章']).replace(/\s+/g,''),stem=body.replace(/\s+/g,''),isPassage=/passage/.test(norm(q['題型']).toLowerCase());if(!isPassage&&article.length>=40&&stem.includes(article))f.push(['warn','passage_content_in_stem','一般題題幹重複包含題組文章。']);;if(/\\mathrm\s*\{\s*\([A-EＡ-Ｅ]\)/.test(body))f.push(['warn','latex_option_label','LaTeX 的 \\mathrm 內含選項標號。']);return f;}
  function toQualityFields(q,ctx){ctx=ctx||{};const ps=ctx.passage||{};return {'題號':q.no,'題目':q.q,'答案':q.ans,'題型':q.type,'圖表類型':q.chart,'題組文章':ps.q||ctx.passageText||'','題組ID':q.groupId,'大題':q.section,'詳解':q.sol};}
  function checkQuestion(q,ctx){return checkFields(toQualityFields(q,ctx),ctx);}
  function paperFlags(qs){let f=[],sections=[[]];qs.forEach((q,i)=>{let n=/^[1-9]\d*$/.test(text(q['題號']).trim())?+q['題號']:null;if(n===null){f.push(['block','invalid_question_number',`第 ${i+1} 筆題號不是正整數。`]);return}if(sections.at(-1).length&&n===1&&(norm(q['大題']).trim()||sections.at(-1).at(-1)[1]>1))sections.push([]);sections.at(-1).push([i,n])});sections.filter(x=>x.length).forEach(s=>{let v=s.map(x=>x[1]),seen=new Set;if(v[0]!==1)f.push(['block','missing_first_question_number',`此大題從 ${v[0]} 開始，缺第 1 題。`]);v.forEach(n=>{if(seen.has(n))f.push(['block','duplicate_question_number',`題號 ${n} 重複。`]);seen.add(n)});v.slice(1).forEach((n,i)=>{if(n<v[i])f.push(['warn','out_of_order_question_number',`題號由 ${v[i]} 倒退為 ${n}，可能是大題重編號。`])});for(let n=1;n<=Math.max(...v);n++)if(!seen.has(n))f.push(['block','missing_question_number',`題號缺 ${n}。`])});let g={};qs.forEach(q=>{let id=text(q['題組ID']).trim();if(id)(g[id]??=[]).push(q)});Object.entries(g).forEach(([id,x])=>{if(!x.some(q=>text(q['題組文章']).trim()))f.push(['block','missing_group_article',`題組 ${id} 的所有子題皆無題組文章。`])});return f;}
  function displayIssues(q,ctx){
    const fields=toQualityFields(q,ctx), issues=[], flags=checkQuestion(q,ctx);
    const add=(key,text)=>{if(!issues.some(x=>x.key===key&&x.text===text))issues.push({key,text});};
    flags.forEach(([,key,message])=>{
      if(key==='missing_image')add(key,'題目提到圖/表但沒有圖：請上傳圖片，或確認不需圖後取消');
      else if(key==='incomplete_options'){
        const p=options(fields['題目']), need=p.E?'ABCDE':'ABCD', missing=[...need].filter(x=>!text(p[x]).trim());
        add(key,missing.length?`缺選項 ${missing.join('、')} 或內容空白`:'選項內容空白：請補齊各選項內容');
      }else if(key==='missing_answer')add(key,'缺答案：請填入正確答案');
      else if(key==='flattened_exponent'||key==='flattened_square_unit'||key==='flattened_subscript'){
        const find=key==='flattened_exponent' ? /(?:\\times|×|x)\s*10[1-9]\d+/i : key==='flattened_square_unit' ? /(?<![A-Za-z0-9])(?:cm|m)(?:2|3)|m\/s2(?![A-Za-z0-9])/i : /(?<![A-Za-z0-9])(?:MnO2|H2O|CO2|SO4)(?![A-Za-z0-9])|(?<![A-Za-z0-9])(?:I|R|V|Q|x|y|z)\d+(?![A-Za-z0-9])/i;
        for(const [field,value] of [['題目',fields['題目']],['題組文章',fields['題組文章']],['詳解',fields['詳解']]]){const m=text(value).match(find);if(m)add(key,`${field}第 ${(m.index||0)+1} 字附近「${m[0]}」疑似上下標被壓平：請改成 LaTeX 上／下標格式`);}
      }else if(/noise|trailing_figure_labels/.test(key)){
        const find=key==='exam_end_noise'?/試題結束|本卷結束|背面尚有試題|請翻頁|第\s*\d+\s*頁/:key==='page_number_noise'?/^\s*-\s*\d+\s*-\s*$/m:key==='page_label_noise'?/(?:^|\n)\s*\(\s*\d+\s*-\s*\d+\s*\)(?=\s|$)|(?:^|\s)\(\s*\d+\s*-\s*\d+\s*\)\s*(?:$|\n)/m:/圖[一二三四五六七八九十]+(?:圖[一二三四五六七八九十]+)+\s*[。．]?$/;
        for(const [field,value] of [['題目',fields['題目']],['題組文章',fields['題組文章']],['詳解',fields['詳解']]]){const m=text(value).match(find);if(m)add(key,`${field}含雜訊「${m[0].trim()}」：請刪除這段文字`);}
      }else add(key,`${message}請確認並修正。`);
    });
    const basis=text(q.basis);if(basis.startsWith('[回報]'))add('report',basis.slice(4).trim()||'有回報內容：請確認並處理');
    if(q.flag&&!issues.length)add('manual_flag','被人工標為待確認（無原因）');
    return issues;
  }
  function paperSummaries(items,ctxFor){
    const groups=new Map;
    (items||[]).forEach(q=>{const issues=displayIssues(q,ctxFor?ctxFor(q):undefined),qa=checkQuestion(q,ctxFor?ctxFor(q):undefined),needs=!!q.flag||qa.some(x=>x[0]==='block');if(!needs)return;const name=text(q.exam).trim()||'未命名考卷',g=groups.get(name)||{exam:name,count:0,reasons:{},firstId:q.id};g.count++;issues.forEach(x=>g.reasons[x.text]=(g.reasons[x.text]||0)+1);if(!issues.length)g.reasons['品質關卡阻擋：請開啟題目查看']=1;groups.set(name,g);});
    return [...groups.values()].map(g=>({...g,primary:Object.entries(g.reasons).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-Hant')).slice(0,2)})).sort((a,b)=>b.count-a.count||a.exam.localeCompare(b.exam,'zh-Hant'));
  }
  const api=Object.freeze({checkQuestion,toQualityFields,checkFields,paperFlags,options,displayIssues,paperSummaries});
  root.QAGate=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
