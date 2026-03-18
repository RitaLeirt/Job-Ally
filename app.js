/* =============================================
   Job AIly — AI简历优化工具
   
   Author:  Rita LEI (雷若彤)
   Email:   ruotong_lei@outlook.com
   GitHub:  github.com/Rita-LEI
   © 2026 Rita LEI. All rights reserved.
   
   Flow: Upload → JD → Optimize → Export
============================================= */

'use strict';

// ===== CONFIG =====
const API_BASE = '';  // same-origin proxy

// ===== STATE =====
let state = {
    // Resume
    resumeFile: null,
    resumeText: '',
    resumeParsed: null,  // { basic, education, internships, projects, practice, others }

    // JD
    jdText: '',
    jdParsed: null,      // { title, skills:[], requirements:[] }

    // Optimization
    modules: [],         // [{id, type, label, icon, data, status:'idle'|'done'|'skipped', optimizedContent}]
    currentModuleIdx: -1,
    flowStep: 1,
    flowResult: null,    // optimized text from AI

    // Server capabilities (populated on init from /api/health)
    serverInfo: { ai_ready: false, mineru_ready: false, model: '' }
};

// Job templates
const JD_TEMPLATES = {
    'pm': `职位名称：互联网产品经理\n\n岗位职责：\n1. 负责产品需求调研与分析，撰写PRD文档\n2. 跨部门协调推动产品迭代，管理产品路线图\n3. 数据分析驱动产品决策，持续优化用户体验\n4. 竞品分析，把握行业动态\n\n任职要求：\n1. 具有需求分析、产品设计、数据分析能力\n2. 熟练使用Axure、Figma等原型工具\n3. 掌握SQL/Python数据分析能力优先\n4. 有互联网产品从0到1经历者优先\n5. 良好的逻辑思维和沟通协调能力`,
    'ai-pm': `职位名称：AI产品经理\n\n岗位职责：\n1. 负责AI产品规划与落地，主导LLM应用场景探索\n2. 编写高质量Prompt，评估模型效果\n3. 与算法团队协作，推动AI能力产品化\n4. 用户研究，构建AI产品评估体系\n\n任职要求：\n1. 了解LLM、RAG、Agent等AI技术\n2. 具备Prompt Engineering能力\n3. 熟悉AI工具链（OpenAI API、LangChain等）\n4. 具有数据分析能力，会Python优先\n5. 对AI行业有浓厚兴趣`,
    'data': `职位名称：数据分析师\n\n岗位职责：\n1. 负责业务数据分析，挖掘数据价值\n2. 构建数据看板和分析报告\n3. A/B实验设计与评估\n4. 与业务团队协作推动数据驱动决策\n\n任职要求：\n1. 熟练掌握SQL，能独立进行复杂查询\n2. 掌握Python（pandas、numpy、matplotlib）\n3. 熟悉Tableau/PowerBI等可视化工具\n4. 了解统计学基础，能进行假设检验\n5. 良好的数据思维和业务理解能力`,
    'consulting': `职位名称：战略咨询顾问\n\n岗位职责：\n1. 参与客户项目，进行市场调研与行业分析\n2. 构建分析框架，完成商业尽职调查\n3. 撰写高质量咨询报告和客户提案\n4. 参与客户沟通，呈现项目成果\n\n任职要求：\n1. 具有扎实的商业分析与逻辑推理能力\n2. 熟练使用Excel（财务建模）、PowerPoint\n3. 英文读写流利，能处理英文资料\n4. 有案例大赛、咨询项目或研究经历优先\n5. 学习能力强，能快速掌握新行业知识`,
    'mkt': `职位名称：市场营销专员\n\n岗位职责：\n1. 负责品牌策划与推广执行\n2. 运营微信、微博、小红书等社交媒体\n3. 策划线上线下活动，提升品牌曝光\n4. 监控营销数据，优化推广效果\n\n任职要求：\n1. 具有品牌策划和内容创作能力\n2. 熟悉主流社交媒体运营逻辑\n3. 有活动策划执行经验\n4. 了解数字营销工具（SEM/SEO/信息流）\n5. 文案功底扎实，有创意思维`,
    'ib': `职位名称：投资银行分析师\n\n岗位职责：\n1. 参与IPO、并购等项目的财务建模与估值\n2. 撰写行业研究报告和投资备忘录\n3. 协助进行尽职调查和数据整理\n4. 制作路演材料和客户报告\n\n任职要求：\n1. 熟练掌握Excel财务建模（DCF、LBO等）\n2. 了解会计、财务、估值知识\n3. 具有较强的英文读写能力\n4. 工作细致、责任心强、能承受高强度工作\n5. 有CFA/ACCA等金融证书优先`
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    try { initNavigation(); } catch(e) { console.error('initNavigation:', e); }
    try { initFileUpload(); } catch(e) { console.error('initFileUpload:', e); }
    try { initJDListener(); } catch(e) { console.error('initJDListener:', e); }
    checkServerHealth();
    console.log('✅ Job AIly loaded');
});

// ===== SERVER HEALTH CHECK =====
async function checkServerHealth() {
    const dot   = document.getElementById('serverDot');
    const label = document.getElementById('serverLabel');
    try {
        const r = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
            const info = await r.json();
            state.serverInfo = info;
            if (info.ai_ready) {
                dot.className   = 'status-dot online';
                label.textContent = 'AI 就绪';
            } else {
                dot.className   = 'status-dot offline';
                label.textContent = 'AI 未配置';
                showToast('⚠️ 服务器AI未配置，将使用模板生成');
            }
            console.log('Server health:', info);
        } else {
            throw new Error('non-200');
        }
    } catch(e) {
        // Running as a local file or server unreachable
        dot.className   = 'status-dot offline';
        label.textContent = '本地模式';
        console.log('No server — fallback mode active');
    }
}

// ===== NAVIGATION =====
function initNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showPage(link.dataset.page);
        });
    });
}

function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.toggle('active', l.dataset.page === page);
    });
    window.scrollTo(0, 0);
}

// ===== STEP MANAGEMENT =====
function setActiveStep(n) {
    document.querySelectorAll('.step-item').forEach(el => {
        const s = +el.dataset.step;
        el.classList.remove('active', 'done');
        if (s === n) el.classList.add('active');
        else if (s < n) el.classList.add('done');
    });
    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`step${n}`).classList.add('active');
}

function goStep1() { setActiveStep(1); }

function goStep2() {
    if (!state.resumeParsed) { showToast('请先上传并解析简历'); return; }
    setActiveStep(2);
    renderJDPreview();
}

function goStep3() {
    if (!state.jdParsed && state.jdText.trim()) {
        state.jdParsed = parseJD(state.jdText);
    }
    if (!state.jdParsed) { showToast('请先输入目标岗位JD'); return; }

    buildModules();
    renderModuleList();
    updateJDRefPanel();
    updateOverallMatch();
    setActiveStep(3);

    // Auto-select first optimizable module (skip 'basic' which needs no optimization)
    const firstIdx = state.modules.findIndex(m => m.type !== 'basic');
    if (firstIdx >= 0) selectModule(firstIdx);
    else if (state.modules.length > 0) selectModule(0);
}

function goStep4() {
    const done = state.modules.filter(m => m.status === 'done').length;
    if (done === 0) { showToast('请至少优化一个模块'); return; }
    renderExportPage();
    setActiveStep(4);
}

// ===== FILE UPLOAD =====
function initFileUpload() {
    const zone = document.getElementById('uploadZone');
    const input = document.getElementById('resumeFile');

    // Drag and drop
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--ink)'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.style.borderColor = '';
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    input.addEventListener('change', () => {
        if (input.files[0]) handleFile(input.files[0]);
    });
}

async function handleFile(file) {
    const allowed = ['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|docx?)$/i)) {
        showToast('请上传 PDF 或 Word 文件');
        return;
    }

    state.resumeFile = file;
    const ext = file.name.split('.').pop().toUpperCase();
    document.getElementById('uploadZone').style.display = 'none';
    const fc = document.getElementById('fileCard');
    fc.style.display = 'flex';
    document.getElementById('fileTypeBadge').textContent = ext;
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatBytes(file.size);

    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    try {
        // ── Step 1: Extract raw text ──────────────────────────────────────
        let text = '';
        if (isPDF && state.serverInfo.mineru_ready) {
            setParseStatus('MinerU 高质量解析中...');
            try {
                text = await parseWithMinerU(file);
            } catch (e) {
                console.warn('MinerU failed, falling back:', e.message);
                setParseStatus('切换本地解析...');
                text = await extractTextLocal(file);
            }
        } else {
            setParseStatus(isPDF ? '提取文本内容...' : '解析Word文件...');
            text = await extractTextLocal(file);
        }
        state.resumeText = text;

        // ── Step 2: AI structured parsing (primary) ───────────────────────
        if (state.serverInfo.ai_ready) {
            setParseStatus('🤖 AI智能解析模块中...');
            try {
                state.resumeParsed = await aiParseResume(text);
                setParseStatus('✓ AI解析完成');
            } catch (e) {
                console.warn('AI parse failed, using local fallback:', e.message);
                setParseStatus('✓ 本地解析完成');
                state.resumeParsed = localParseResume(text);
            }
        } else {
            setParseStatus('✓ 本地解析完成');
            state.resumeParsed = localParseResume(text);
        }

        showParsePreview(state.resumeParsed);
        document.getElementById('step1Next').disabled = false;

    } catch (err) {
        console.error('File parse error:', err);
        setParseStatus('解析失败，请粘贴文本');
        showToast('文件解析失败，请点击「粘贴文本」手动输入');
    }
}

function setParseStatus(msg) {
    document.getElementById('parseStatusText').textContent = msg;
    const spinner = document.getElementById('parseSpinner');
    if (msg.startsWith('✓') || msg.includes('失败')) {
        spinner.style.display = 'none';
    } else {
        spinner.style.display = 'inline-block';
    }
}

// MinerU cloud parsing: upload → create task → poll result
async function parseWithMinerU(file) {
    // Step 1: Get pre-signed upload URL from our backend
    const urlRes = await fetch(`${API_BASE}/api/mineru/upload_url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            files: [{ name: file.name, size: file.size, content_type: 'application/pdf' }]
        })
    });
    if (!urlRes.ok) throw new Error('MinerU: failed to get upload URL');
    const urlData = await urlRes.json();
    if (urlData.code !== 0) throw new Error('MinerU: ' + urlData.msg);

    const fileInfo = urlData.data?.files?.[0];
    if (!fileInfo?.url) throw new Error('MinerU: no upload URL in response');

    // Step 2: Upload file directly to MinerU's S3
    setParseStatus('上传文件到 MinerU...');
    const uploadRes = await fetch(fileInfo.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file
    });
    if (!uploadRes.ok) throw new Error('MinerU: upload failed ' + uploadRes.status);

    // Step 3: Create extraction task
    setParseStatus('MinerU 提取中...');
    const taskRes = await fetch(`${API_BASE}/api/mineru/create_task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            file_id: fileInfo.file_id,
            language: 'zh',
            layout_model: 'doclayout_yolo',
            formula_enable: false,
            table_enable: true,
            // Request markdown output for better structure preservation
            output_formats: ['markdown'],
            enable_markdown: true
        })
    });
    if (!taskRes.ok) throw new Error('MinerU: task creation failed');
    const taskData = await taskRes.json();
    if (taskData.code !== 0) throw new Error('MinerU: ' + taskData.msg);
    const taskId = taskData.data?.task_id;
    if (!taskId) throw new Error('MinerU: no task_id returned');

    // Step 4: Poll until done (max 90 seconds)
    const text = await pollMinerUTask(taskId, 90);
    return text;
}

async function pollMinerUTask(taskId, maxSeconds) {
    const deadline = Date.now() + maxSeconds * 1000;
    while (Date.now() < deadline) {
        await sleep(2500);
        const r = await fetch(`${API_BASE}/api/mineru/task/${taskId}`);
        if (!r.ok) continue;
        const data = await r.json();
        const state_val = data.data?.state;

        if (state_val === 'done') {
            const result = data.data?.result || {};

            // Priority 1: full_markdown — best quality, preserves headings and structure
            let text = result.full_markdown || result.markdown || '';

            // Priority 2: reconstruct from pages with structure awareness
            if (!text.trim()) {
                const pages = result.pages || [];
                text = pages.map(p => {
                    const blocks = p.page_content || p.content || [];
                    return blocks.map(b => {
                        const isHeading = b.type === 'title' || b.category === 'title';
                        return (isHeading ? '\n' : '') + (b.text || b.content || '');
                    }).join('\n');
                }).join('\n\n');
            }

            // Priority 3: plain join as last resort
            if (!text.trim()) {
                const pages = result.pages || [];
                text = pages.map(p =>
                    (p.page_content || []).map(b => b.text || '').join('\n')
                ).join('\n');
            }

            if (!text.trim()) throw new Error('MinerU: empty result');
            return text;
        }
        if (state_val === 'failed') {
            throw new Error('MinerU: task failed - ' + (data.data?.err_msg || 'unknown'));
        }
        const pct = data.data?.progress ?? 0;
        setParseStatus(`MinerU 解析中 ${pct}%...`);
    }
    throw new Error('MinerU: timed out after ' + maxSeconds + 's');
}

// ===== LOCAL TEXT EXTRACTION (browser-side fallback) =====
async function extractTextLocal(file) {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        return await extractPDF(file);
    } else {
        return await extractWord(file);
    }
}

async function extractPDF(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // Preserve line breaks by grouping items by y-position
        const items = content.items;
        let lastY = null;
        for (const item of items) {
            const y = item.transform?.[5];
            if (lastY !== null && Math.abs(y - lastY) > 3) text += '\n';
            text += item.str;
            lastY = y;
        }
        text += '\n';
    }
    return text;
}

async function extractWord(file) {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
}

function removeFile() {
    state.resumeFile = null;
    state.resumeText = '';
    state.resumeParsed = null;
    document.getElementById('uploadZone').style.display = '';
    document.getElementById('fileCard').style.display = 'none';
    document.getElementById('parsePreview').style.display = 'none';
    document.getElementById('step1Next').disabled = true;
    document.getElementById('resumeFile').value = '';
}

function showParsePreview(parsed) {
    const preview = document.getElementById('parsePreview');
    const chips   = document.getElementById('parseChips');
    preview.style.display = '';

    const modules = [];
    if (parsed.basic?.name)           modules.push(`👤 ${parsed.basic.name}`);
    if (parsed.education?.length)     modules.push(`🎓 教育背景 ×${parsed.education.length}`);
    if (parsed.internships?.length)   modules.push(`🏢 实习经历 ×${parsed.internships.length}`);
    if (parsed.projects?.length)      modules.push(`💡 项目经历 ×${parsed.projects.length}`);
    if (parsed.practice?.length)      modules.push(`🌱 实践经历 ×${parsed.practice.length}`);
    const o = parsed.others || {};
    const otherCount = (o.skills?.length||0)+(o.languages?.length||0)+(o.certifications?.length||0)+(o.honors?.length||0);
    if (otherCount || o.summary)      modules.push(`⚡ 其他信息`);

    if (modules.length === 0) {
        modules.push('📄 已读取文本内容');
        document.getElementById('parseModules').textContent = '内容已读取（可继续）';
    } else {
        document.getElementById('parseModules').textContent = `识别到 ${modules.length} 个模块`;
    }
    chips.innerHTML = modules.map(m => `<span class="parse-chip">${m}</span>`).join('');
}

// ===== PASTE MODAL =====
function openPasteModal() {
    document.getElementById('pasteModal').style.display = 'flex';
}

function closePasteModal() {
    document.getElementById('pasteModal').style.display = 'none';
}

async function confirmPaste() {
    const text = document.getElementById('pasteTextarea').value.trim();
    if (!text) { showToast('请输入简历内容'); return; }

    state.resumeText = text;

    document.getElementById('uploadZone').style.display = 'none';
    const fc = document.getElementById('fileCard');
    fc.style.display = 'flex';
    document.getElementById('fileTypeBadge').textContent = 'TXT';
    document.getElementById('fileName').textContent = '粘贴的文本内容';
    document.getElementById('fileSize').textContent = `${text.length} 字符`;

    closePasteModal();

    // AI parsing
    if (state.serverInfo.ai_ready) {
        setParseStatus('🤖 AI智能解析中...');
        try {
            state.resumeParsed = await aiParseResume(text);
            setParseStatus('✓ AI解析完成');
        } catch (e) {
            state.resumeParsed = localParseResume(text);
            setParseStatus('✓ 解析完成');
        }
    } else {
        state.resumeParsed = localParseResume(text);
        setParseStatus('✓ 解析完成');
    }

    showParsePreview(state.resumeParsed);
    document.getElementById('step1Next').disabled = false;
}

// ===== RESUME PARSING =====
// Primary: AI-powered structured parsing (accurate, handles any format)
// Fallback: local regex-based parsing (when AI unavailable)

// ── AI Parse: sends raw text → gets clean JSON back ──────────────────────────
async function aiParseResume(rawText) {
    const text = preprocessResumeText(rawText).slice(0, 6000);

    const systemPrompt = `你是简历结构化解析器。任务：把简历原文准确解析为JSON，绝不输出JSON以外的任何内容。

## 6个字段的定义与判断标准

**basic**（只有1个对象）
- 姓名、手机、邮箱、城市等头部联系信息，不包含任何经历内容

**education**（数组，每所学校一条记录）
- 正式学历：大学、研究生院校
- 把该学校的所有信息（学历、专业、时间、GPA、副修、课程、奖学金）全部合并到同一条记录
- ⚠️ 严禁把"副修：XX"单独列一条；⚠️ 严禁把"课程：XX"单独列一条
- ⚠️ 严禁把"27届毕业生"、"已拿offer"列一条；把这类备注放进notes字段
- ⚠️ 极重要：只要一行包含"大学/学院"+"本科/硕士/博士"，无论它出现在哪个section标记下，都必须放入education数组

**internships**（数组，每段实习一条记录）
- 条件：在正规公司/机构任职 + 有职位头衔 + 有工作内容描述
- 把该实习的所有工作描述合并到bullets数组，不要拆成多条记录
- ⚠️ 判断是实习 vs 项目：在公司有职位 → internships；自主课题/竞赛/课程 → projects
- ⚠️ 极重要：如果一行是"大学+本科/硕士"，绝对不能放进internships，即使它在== 实习经历 ==区块里

**projects**（数组）
- 课题研究、竞赛项目、课程项目、个人或团队开发项目
- 不在正规公司任职，没有公司给的职位头衔

**practice**（数组）
- 校园社团、学生会、志愿者、公益活动、支教/义教

**others**（1个对象）
- skills: 技术工具列表（Python、Excel、Figma等）
- languages: 语言及级别（英语CET-6 580等）
- certifications: 证书（华为认证等）
- honors: 奖项荣誉
- summary: 自我评价段落

## 输出格式（纯JSON，无任何其他文字）
{"basic":{"name":"","phone":"","email":"","location":"","other":""},"education":[{"school":"","degree":"","major":"","minor":"","time":"","gpa":"","rank":"","awards":"","courses":"","notes":""}],"internships":[{"company":"","position":"","department":"","time":"","bullets":[]}],"projects":[{"title":"","role":"","time":"","tech":"","bullets":[]}],"practice":[{"org":"","role":"","time":"","bullets":[]}],"others":{"skills":[],"languages":[],"certifications":[],"honors":[],"summary":""}}`;

    const response = await fetch(`${API_BASE}/api/ai_chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: text }
            ],
            temperature: 0.05,
            max_tokens: 3500
        })
    });

    if (!response.ok) throw new Error('AI parse failed ' + response.status);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let content = data.choices?.[0]?.message?.content || '';
    content = content.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');

    const parsed = JSON.parse(jsonMatch[0]);
    return normalizeAIParsed(parsed);
}
// Normalize AI output — guards every field AND filters obvious mis-classified noise
function normalizeAIParsed(raw) {
    const str  = v => (typeof v === 'string' ? v.trim() : String(v || ''));
    const arr  = v => Array.isArray(v) ? v : [];
    const strs = v => arr(v).map(str).filter(Boolean);
    const normBullets = list => strs(list);

    // Detect an education entry by its company/org field
    const EDU_COMPANY_RE = /(大学|学院|University|College|Institute)/i;
    const DEGREE_RE = /(本科|硕士|博士|学士|专科|Bachelor|Master|PhD|MBA|MPA)/i;
    const isSchoolEntry = (company, position) =>
        EDU_COMPANY_RE.test(company) && (DEGREE_RE.test(company) || DEGREE_RE.test(position || ''));

    // Rescue education entries mis-placed in internships
    const rescuedEduFromInternships = [];
    const cleanedInternships = arr(raw.internships).filter(i => {
        if (isSchoolEntry(str(i.company), str(i.position))) {
            // Convert internship entry → education entry
            rescuedEduFromInternships.push({
                school:  str(i.company),
                degree:  str(i.position) || '',
                major:   '',
                minor:   '',
                time:    str(i.time),
                gpa:     '',
                rank:    '',
                awards:  '',
                courses: normBullets(i.bullets).join('、'),
                notes:   '',
            });
            return false; // remove from internships
        }
        return true;
    });

// Noise patterns: things that should NEVER appear as a company/org/project title
    const NOISE_RE = /^(教育经历|实习经历|工作经历|项目经历|实践经历|活动经历|技能|其他|荣誉|证书|语言|自我评价|副修[:：]|课程[:：]|27届|已拿offer|在职|毕业生)/i;
    const isNoise = s => !s || NOISE_RE.test(s.trim());

    // Clean a school/company name: strip leading date prefix if AI included it
    const cleanName = s => {
        if (!s) return '';
        // Strip leading time range: "2026.08 - 2027.07 香港中文大学..." → "香港中文大学..."
        return s.replace(/^\d{4}[.\-\/]\d{1,2}\s*[-–至~]\s*(\d{4}[.\-\/]\d{1,2}|至今|Present)\s*/i, '').trim();
    };

    const isRealCompany = s => {
        const cleaned = cleanName(s);
        if (!cleaned || cleaned.length < 2) return false;
        if (NOISE_RE.test(cleaned)) return false;
        return true;
    };

    const isRealSchool = s => {
        const cleaned = cleanName(s);
        if (!cleaned || cleaned.length < 2) return false;
        if (NOISE_RE.test(cleaned)) return false;
        return true;
    };

    return {
        basic: {
            name:     str(raw.basic?.name),
            phone:    str(raw.basic?.phone),
            email:    str(raw.basic?.email),
            location: str(raw.basic?.location),
            other:    str(raw.basic?.other ?? raw.basic?.extra ?? raw.basic?.linkedin),
        },

        education: [
            ...arr(raw.education).map(e => ({
                school:  cleanName(str(e.school)),
                degree:  str(e.degree),
                major:   str(e.major),
                minor:   str(e.minor ?? ''),
                time:    str(e.time),
                gpa:     str(e.gpa),
                rank:    str(e.rank),
                awards:  str(e.awards),
                courses: str(e.courses),
                notes:   str(e.notes ?? ''),
            })).filter(e => isRealSchool(e.school)),
            // Merge rescued education entries that were mis-placed in internships
            ...rescuedEduFromInternships.map(e => ({ ...e, school: cleanName(e.school) }))
                .filter(e => isRealSchool(e.school)),
        ],

        internships: cleanedInternships.map(i => ({
            company:    cleanName(str(i.company)),
            position:   str(i.position),
            department: str(i.department),
            time:       str(i.time),
            bullets:    normBullets(i.bullets),
        })).filter(i => isRealCompany(i.company)),

        projects: arr(raw.projects).map(p => ({
            title:   str(p.title),
            role:    str(p.role),
            time:    str(p.time),
            tech:    str(p.tech),
            bullets: normBullets(p.bullets),
        })).filter(p => p.title && !isNoise(p.title)),

        practice: arr(raw.practice ?? raw.campus).map(c => ({
            org:     str(c.org),
            role:    str(c.role),
            time:    str(c.time),
            bullets: normBullets(c.bullets),
        })).filter(c => c.org && !isNoise(c.org)),

        others: {
            languages:      strs(raw.others?.languages ?? raw.skills?.languages),
            certifications: strs(raw.others?.certifications ?? raw.skills?.certifications),
            skills: strs(
                raw.others?.skills ??
                [...(raw.skills?.tech||[]), ...(raw.skills?.tools||[]), ...(raw.skills?.others||[])]
            ),
            summary: str(raw.others?.summary ?? raw.summary ?? ''),
            honors:  strs(raw.others?.honors ?? raw.honors),
        },
    };
}

// ── Local fallback parser (regex-based, no AI required) ────────────────────
// Pre-process resume text: normalize section headers AND fix mis-placed education entries
function preprocessResumeText(rawText) {
    let text = rawText.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ');

    // Step 1: Mark known section headers clearly (longer patterns first)
    const HEADERS = [
        '活动与实践经历', '技能/证书及其他', '技能/证书',
        '教育经历', '教育背景', '学历背景',
        '实习经历', '工作经历', '实习经验',
        '项目经历', '项目经验', '科研经历',
        '实践经历', '校园经历', '活动经历',
        '专业技能', '自我评价', '个人总结',
        '荣誉奖项', '获奖经历',
    ];
    HEADERS.forEach(h => {
        const escaped = h.replace(/\//g, '\\/');
        const re = new RegExp('(^|\\n)[▶►▸●■□◆◇★☆➤▷]?\\s*' + escaped + '\\s*($|\\n)', 'g');
        text = text.replace(re, '\n\n== ' + h + ' ==\n');
    });
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    // Step 2: Rescue education entries that landed in the wrong section
    // Pattern: a line with time range + school name + degree keyword
    const EDU_LINE_RE = /^(\d{4}[.\-\/]\d{1,2}[^]*?)(大学|学院|University|College|Institute)[^\n]*(本科|硕士|博士|学士|专科|Bachelor|Master|PhD|MBA|MPA)/im;

    // Split into sections, check each non-education section for school entries
    const parts = text.split(/(== .+? ==)/);
    // parts: [pre, header1, content1, header2, content2, ...]
    let currentSection = '';
    const rescued = [];

    for (let i = 0; i < parts.length; i++) {
        if (/^== .+ ==$/.test(parts[i].trim())) {
            currentSection = parts[i].trim();
        } else if (currentSection && !/教育|Education/i.test(currentSection)) {
            // This is content in a non-education section — check for school entries
            const lines = parts[i].split('\n');
            const kept = [], moved = [];
            let moveBuf = false;
            lines.forEach(line => {
                if (EDU_LINE_RE.test(line)) {
                    moveBuf = true;
                    moved.push(line);
                } else if (moveBuf && line.trim() && !/^\d{4}[.\-]/.test(line) && !/^(TCL|深圳市|Knova|IBM|\d{4}\.\d{2} - )/.test(line)) {
                    // continuation of the school entry (courses, notes etc.)
                    moved.push(line);
                } else {
                    moveBuf = false;
                    kept.push(line);
                }
            });
            if (moved.length > 0) {
                parts[i] = kept.join('\n');
                rescued.push(...moved);
            }
        }
    }

    text = parts.join('');

    // Inject rescued education entries into the education section
    if (rescued.length > 0) {
        const eduMarker = '== 教育经历 ==';
        if (text.includes(eduMarker)) {
            text = text.replace(eduMarker, eduMarker + '\n' + rescued.join('\n'));
        } else {
            // No education section found — create one at the top
            const firstSection = text.indexOf('\n\n==');
            if (firstSection >= 0) {
                text = text.slice(0, firstSection) + '\n\n== 教育经历 ==\n' + rescued.join('\n') + text.slice(firstSection);
            }
        }
    }

    return text.replace(/\n{3,}/g, '\n\n').trim();
}

function localParseResume(rawText) {
    const text  = preprocessResumeText(rawText).replace(/[ \t]+/g, ' ');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const HEADS = [
        { re: /^(教育背景|教育经历|学历|学历背景|Education)/i,                      type: 'education'   },
        { re: /^(实习经历|工作经历|实习经验|实习|Internship|Work\s*Exp)/i,           type: 'internship'  },
        { re: /^(项目经历|项目经验|主要项目|科研|Project|Research)/i,                type: 'project'     },
        { re: /^(实践经历|志愿|社团|学生会|课外活动|校园经历|Campus|Activities|Practice)/i, type: 'practice' },
        { re: /^(专业技能|技能|Skills|核心技能|技术栈)/i,                            type: 'skills'      },
        { re: /^(证书|语言|英语|Language|Certif)/i,                                 type: 'certs'       },
        { re: /^(荣誉|获奖|奖项|Honor|Award)/i,                                     type: 'honors'      },
        { re: /^(自我评价|个人简介|个人总结|About|Summary|Profile)/i,                type: 'summary'     },
    ];

    const sections = {};
    let cur = 'header'; let buf = [];
    const flush = () => {
        if (buf.length && cur !== 'header') {
            sections[cur] = (sections[cur] || '') + buf.join('\n') + '\n';
        }
        buf = [];
    };

    for (const line of lines) {
        let matched = null;
        // Short lines are likely section headers
        if (line.length <= 20) {
            for (const h of HEADS) { if (h.re.test(line)) { matched = h.type; break; } }
        }
        if (!matched) {
            for (const h of HEADS) {
                if (h.re.test(line)) {
                    flush(); cur = h.type;
                    const stripped = line.replace(h.re, '').trim();
                    if (stripped) buf.push(stripped);
                    matched = 'inline'; break;
                }
            }
        }
        if (matched && matched !== 'inline') { flush(); cur = matched; }
        else if (!matched) buf.push(line);
    }
    flush();

    // Basic info from header
    const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
    const phoneMatch = text.match(/(?:\+86[-\s]?)?1[3-9]\d{9}/);
    let name = '';
    const nameLabel = text.match(/(?:姓名|Name)[：:\s]+([^\s\n，,]{2,10})/i);
    if (nameLabel) { name = nameLabel[1]; }
    else {
        for (const line of lines.slice(0, 5)) {
            if (/^[\u4e00-\u9fa5]{2,5}$/.test(line) || /^[A-Z][a-z]+(?: [A-Z][a-z]+)+$/.test(line)) {
                name = line; break;
            }
        }
    }

    const skillsList = [];
    const langList   = [];
    const certList   = [];
    const skillsRaw  = (sections.skills || '') + (sections.certs || '');
    skillsRaw.split('\n').forEach(line => {
        line.split(/[,，、|｜·;；\/]+/).forEach(s => {
            const t = s.replace(/^[•\-]\s*/, '').trim();
            if (!t || t.length > 40) return;
            if (/英语|CET|雅思|托福|普通话|粤语|法语|日语|德语|Spanish|French/i.test(t)) langList.push(t);
            else if (/证书|认证|PMP|CFA|CPA|考级|资格|License/i.test(t)) certList.push(t);
            else skillsList.push(t);
        });
    });

    return {
        basic:      { name, phone: phoneMatch?.[0]||'', email: emailMatch?.[0]||'', location:'', other:'' },
        education:  sections.education  ? parseLocalEdu(sections.education)           : [],
        internships:sections.internship ? parseLocalExp(sections.internship,'internship') : [],
        projects:   sections.project    ? parseLocalExp(sections.project,   'project')   : [],
        practice:   sections.practice   ? parseLocalExp(sections.practice,  'practice')  : [],
        others: {
            skills:         skillsList.slice(0, 20),
            languages:      langList,
            certifications: certList,
            honors: sections.honors
                ? sections.honors.split('\n').filter(l=>l.trim().length>2).map(l=>l.trim())
                : [],
            summary: sections.summary?.trim() || '',
        },
    };
}

function parseLocalEdu(text) {
    const results = [];
    const lines   = text.split('\n').map(l => l.trim()).filter(Boolean);

    const TIME_RE   = /(\d{4}[.\-\/]\d{1,2})\s*[-\u2013\u81f3~]+\s*(\d{4}[.\-\/]\d{1,2}|\u81f3\u4eca|Present)/i;
    const SCHOOL_RE = /\u5927\u5b66|\u5b66\u9662|University|College|Institute/i;
    const DEGREE_RE = /(\u672c\u79d1|\u7855\u58eb|\u535a\u58eb|\u5b66\u58eb|\u5927\u4e13|Bachelor|Master|PhD|MBA|MPA)/i;
    const MINOR_RE  = /\u526f\u4fee[:\uff1a\s]*([^\n\uff0c,\u3002]{2,20})/i;
    const COURSE_RE = /\u8bfe\u7a0b[:\uff1a\s]*([^\n]{4,})/i;
    const GPA_RE    = /GPA[:\uff1a\s]*([\d.]+)/i;
    const RANK_RE   = /\u6392\u540d[:\uff1a\s]*([^\s\uff0c,\u3002\n]{2,20})/i;

    function extractSchoolName(line) {
        // Strip leading time range, then extract school name
        let s = line.replace(/^\d{4}[.\-\/]\d{1,2}\s*[-\u2013\u81f3~]+\s*(?:\d{4}[.\-\/]\d{1,2}|\u81f3\u4eca|Present)\s*/i, '').trim();
        // Extract just the school name (up to first space after school keyword)
        const m = s.match(/([^\s]*(?:\u5927\u5b66|\u5b66\u9662|University|College|Institute)[^\s\uff08(]*(?:[\uff08(][^\uff09)]*[\uff09)])?)/i);
        return m ? m[1].trim() : s.split(/\s/)[0] || s.slice(0, 40);
    }

    function extractMajor(line) {
        // After school name and degree keyword, remaining text is often major
        let s = line.replace(/^\d{4}[.\-\/]\d{1,2}\s*[-\u2013\u81f3~]+\s*(?:\d{4}[.\-\/]\d{1,2}|\u81f3\u4eca|Present)\s*/i, '').trim();
        s = s.replace(/([^\s]*(?:\u5927\u5b66|\u5b66\u9662|University|College|Institute)[^\s\uff08(]*(?:[\uff08(][^\uff09)]*[\uff09)])?)\s*/i, '').trim();
        s = s.replace(DEGREE_RE, '').trim();
        return s.length >= 2 && s.length <= 25 ? s : '';
    }

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (SCHOOL_RE.test(line)) {
            const block = lines.slice(i, Math.min(i + 6, lines.length)).join(' ');
            const tm      = line.match(TIME_RE) || block.match(TIME_RE);
            const dm      = line.match(DEGREE_RE) || block.match(DEGREE_RE);
            const gm      = block.match(GPA_RE);
            const rm      = block.match(RANK_RE);
            const minorM  = block.match(MINOR_RE);
            const courseM = lines.slice(i + 1, Math.min(i + 6, lines.length)).find(l => COURSE_RE.test(l));
            const courseTxt = courseM ? courseM.match(COURSE_RE)[1] : '';

            results.push({
                school:  extractSchoolName(line),
                degree:  dm ? dm[1] : '',
                major:   extractMajor(line),
                minor:   minorM ? minorM[1] : '',
                time:    tm ? tm[1] + ' - ' + tm[2] : '',
                gpa:     gm ? gm[1] : '',
                rank:    rm ? rm[1] : '',
                awards:  '',
                courses: courseTxt.slice(0, 120),
                notes:   '',
            });
            i += 2;
        } else { i++; }
    }
    return results.slice(0, 5);
}

function parseLocalExp(text, type) {
    const results = [];
    const lines   = text.split('\n').map(l => l.trim()).filter(Boolean);

    const TIME_RE   = /\d{4}[.\-\/]\d{1,2}/;
    const BULLET_RE = /^[·\u2022\-\uff0d\u25aa\u25b8\u2192]\s*/;
    const VERB_RE   = /^(\u8d1f\u8d23|\u53c2\u4e0e|\u5b8c\u6210|\u5b9e\u73b0|\u5f00\u53d1|\u8bbe\u8ba1|\u5206\u6790|\u6784\u5efa|\u4e3b\u5bfc|\u63a8\u8fdb|\u4f18\u5316|\u652f\u6301|\u534f\u52a9|\u8c03\u7814|\u64b0\u5199|\u7b56\u5212|\u7ec4\u7ec7|\u5e26\u9886|\u7ba1\u7406|\u641e\u5efa|\u63a8\u52a8)/;
    const SCHOOL_RE = /\u5927\u5b66|\u5b66\u9662|University|College|Institute/i;
    const DEGREE_RE = /\u672c\u79d1|\u7855\u58eb|\u535a\u58eb|\u5b66\u58eb|\u5927\u4e13|Bachelor|Master|PhD/i;
    const NOISE_STARTS = /^(\u8bfe\u7a0b|\u526f\u4fee|GPA|\u6392\u540d|\u5956|\u7231\u597d)/;

    function extractName(line) {
        return line.replace(/^\d{4}[.\-\/]\d{1,2}\s*(?:[-\u2013\u81f3~]+\s*(?:\d{4}[.\-\/]\d{1,2}|\u81f3\u4eca|Present))?\s*/i, '').trim().slice(0, 60);
    }

    function isHeader(line) {
        if (BULLET_RE.test(line) || VERB_RE.test(line) || NOISE_STARTS.test(line)) return false;
        // Must have a date to be an entry header (we preprocessed section boundaries already)
        if (!TIME_RE.test(line)) return false;
        return true;
    }

    let cur = null, bullets = [];
    const push = () => {
        if (!cur) return;
        cur.bullets = [...bullets];
        const isEduEntry = type === 'internship' && SCHOOL_RE.test(cur.company || '') && DEGREE_RE.test((cur.company || '') + ' ' + (cur.position || ''));
        if (!isEduEntry) results.push(cur);
        cur = null; bullets = [];
    };

    for (const line of lines) {
        if (NOISE_STARTS.test(line)) continue; // skip "课程：..." "副修：..." etc

        const isBullet = BULLET_RE.test(line) || (cur && VERB_RE.test(line));
        if (isBullet && cur) { bullets.push(line.replace(BULLET_RE, '').trim()); continue; }

        if (isHeader(line)) {
            push();
            const tm   = line.match(TIME_RE);
            const name = extractName(line);
            if (!name || name.length < 2) continue;

            if (type === 'internship') {
                // Split: typically "公司名 部门 职位" with multiple spaces or single spaces
                // Strategy: last segment containing 实习生/经理/专员/顾问 = position
                const POSITION_RE = /(实习生|经理|专员|顾问|分析师|工程师|设计师|市场|产品|运营|Intern|Manager|Analyst|Engineer)$/;
                const segs = name.split(/\s+/);
                let company = name, position = '', department = '';
                // Find position keyword from the end
                for (let si = segs.length - 1; si >= 0; si--) {
                    if (POSITION_RE.test(segs[si]) || segs[si].length <= 8 && /生$|师$|员$|导$/.test(segs[si])) {
                        // Everything from this index to end = position
                        position  = segs.slice(si).join(' ');
                        // Second last big chunk = department
                        const rest = segs.slice(0, si);
                        if (rest.length > 1) { department = rest[rest.length - 1]; company = rest.slice(0, -1).join(' '); }
                        else company = rest.join(' ');
                        break;
                    }
                }
                if (!company) company = name;
                cur = { company, position, department, time: tm ? tm[0] : '', bullets: [] };
            } else if (type === 'practice') {
                cur = { org: name, role: '', time: tm ? tm[0] : '', bullets: [] };
            } else {
                cur = { title: name, role: '', time: tm ? tm[0] : '', tech: '', bullets: [] };
            }
        } else if (cur && line.length > 3) {
            bullets.push(line.trim());
        }
    }
    push();
    return results.slice(0, 8);
}

// ===== JD =====
function initJDListener() {
    const ta = document.getElementById('jdInput');
    if (!ta) return;
    let debounce;
    ta.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            const text = ta.value.trim();
            state.jdText = text;
            if (text.length > 50) {
                state.jdParsed = parseJD(text);
                renderJDPreview();
                document.getElementById('step2Next').disabled = false;
            } else {
                document.getElementById('step2Next').disabled = true;
                document.getElementById('jdPreviewEmpty').style.display = '';
                document.getElementById('jdKeywordsBox').style.display = 'none';
            }
        }, 400);
    });
}

function switchJDTab(tab, btn) {
    document.querySelectorAll('.jd-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const paste    = document.getElementById('jdPastePanel');
    const template = document.getElementById('jdTemplatePanel');
    if (tab === 'paste') {
        paste.style.display    = 'flex';
        template.style.display = 'none';
    } else {
        paste.style.display    = 'none';
        template.style.display = 'flex';
        template.style.flex    = '1';
    }
}

function pickTemplate(type) {
    const jd = JD_TEMPLATES[type];
    if (!jd) return;
    document.querySelectorAll('.tpl-card').forEach(c => c.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    state.jdText = jd;
    state.jdParsed = parseJD(jd);
    document.getElementById('jdInput').value = jd;

    // Switch to paste tab to show text
    renderJDPreview();
    document.getElementById('step2Next').disabled = false;
}

function parseJD(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Title — first line mentioning 职位/岗位, or first short line
    let title = '';
    const titleLine = lines.find(l => /职位名称|岗位名称|Position|Title/i.test(l));
    if (titleLine) {
        title = titleLine.replace(/.*[:：]\s*/, '').trim();
    } else if (lines[0] && lines[0].length < 35) {
        title = lines[0];
    }

    // Extract skills/keywords from a broad list
    const skillKeywords = [
        'Python','SQL','Excel','PowerPoint','Tableau','Figma','Axure','Java',
        'JavaScript','React','Vue','Git','R语言','SPSS','MATLAB','VBA','TensorFlow',
        'PyTorch','LangChain','OpenAI','ChatGPT','LLM','RAG','Prompt Engineering',
        '数据分析','数据可视化','财务建模','用户研究','需求分析','产品设计',
        'A/B测试','机器学习','深度学习','自然语言处理','大模型','Agent',
        '商业分析','战略分析','案头研究','尽职调查','财务分析',
        '品牌策划','内容营销','社媒运营','市场调研','活动策划',
        'DCF','LBO','估值','行研','路演','英文','CFA','ACCA',
        'PPT','Word','逻辑思维','沟通协调','项目管理','跨部门协作'
    ];
    const skills = skillKeywords.filter(s => text.toLowerCase().includes(s.toLowerCase()));

    // Extract numbered requirements (职责 + 要求两部分都要)
    const reqs = [];
    lines.forEach(line => {
        if (/^\d+[.、。]\s*\S/.test(line) && line.length > 8) {
            reqs.push(line.replace(/^\d+[.、。]\s*/, '').trim());
        }
    });

    // Extract responsibilities section text (岗位职责 block)
    let responsibilities = '';
    let inResp = false;
    for (const line of lines) {
        if (/岗位职责|工作职责|主要职责|Job Responsibilities/i.test(line)) {
            inResp = true; continue;
        }
        if (inResp && /任职要求|岗位要求|Job Requirements|招聘要求/i.test(line)) {
            inResp = false; continue;
        }
        if (inResp && line.length > 3) responsibilities += line + '\n';
    }

    return {
        title: title || '目标岗位',
        skills,
        requirements: reqs.slice(0, 12),
        responsibilities: responsibilities.trim(),
        fullText: text.trim()   // ← 保留完整 JD 原文供 AI 使用
    };
}

function renderJDPreview() {
    if (!state.jdParsed) return;
    const p = state.jdParsed;

    document.getElementById('jdPreviewEmpty').style.display = 'none';
    document.getElementById('jdKeywordsBox').style.display = '';

    const skillsEl = document.getElementById('kwSkills');
    skillsEl.innerHTML = p.skills.map(s =>
        `<span class="kw-tag">${escHtml(s)}</span>`
    ).join('');

    const reqsEl = document.getElementById('kwReqs');
    reqsEl.innerHTML = p.requirements.map(r => `<li>${escHtml(r)}</li>`).join('');

    // Show toggle button if more than 5 requirements
    const toggleBtn = document.getElementById('jdReqToggleBtn');
    if (toggleBtn) {
        toggleBtn.style.display = p.requirements.length > 5 ? '' : 'none';
        toggleBtn.textContent = '折叠';
        reqsEl.style.maxHeight = '';
        reqsEl.style.overflow = '';
    }

    // Match calculation vs resume
    if (state.resumeText) {
        const matched = p.skills.filter(s => state.resumeText.toLowerCase().includes(s.toLowerCase()));
        const pct = p.skills.length ? Math.round((matched.length / p.skills.length) * 100) : 0;
        document.getElementById('jdMatchFill').style.width = pct + '%';
        document.getElementById('jdMatchPct').textContent = pct + '%';
    }
}

function toggleJDReqs() {
    const el  = document.getElementById('kwReqs');
    const btn = document.getElementById('jdReqToggleBtn');
    if (!el) return;
    const collapsed = el.style.maxHeight && el.style.maxHeight !== 'none';
    if (collapsed) {
        el.style.maxHeight = '';
        el.style.overflow = '';
        btn.textContent = '折叠';
    } else {
        el.style.maxHeight = '120px';
        el.style.overflow = 'hidden';
        btn.textContent = '展开全部';
    }
}

// ===== BUILD MODULES =====
function buildModules() {
    state.modules = [];
    const p = state.resumeParsed;
    if (!p) return;

    const push = (id, type, label, sublabel, icon, data) =>
        state.modules.push({ id, type, label, sublabel, icon, data, status:'idle', optimizedContent:null });

    // 1. 基本信息
    if (p.basic?.name || p.basic?.phone || p.basic?.email) {
        push('basic', 'basic', '基本信息',
            p.basic.name || '姓名/联系方式', '👤', p.basic);
    }

    // 2. 教育背景
    (p.education || []).forEach((edu, i) => {
        const sub = [edu.degree, edu.major].filter(Boolean).join(' · ') || '教育信息';
        push(`edu-${i}`, 'education', edu.school || '教育背景', sub, '🎓', edu);
    });

    // 3. 实习/工作经历
    (p.internships || []).forEach((intern, i) => {
        const sub = [intern.position, intern.department].filter(Boolean).join(' · ') || '实习生';
        push(`intern-${i}`, 'internship', intern.company || '实习经历', sub, '🏢', intern);
    });

    // 4. 项目经历
    (p.projects || []).forEach((proj, i) => {
        const sub = [proj.role, proj.tech].filter(Boolean).join(' · ') || '项目成员';
        push(`proj-${i}`, 'project', proj.title || '项目经历', sub, '💡', proj);
    });

    // 5. 实践经历 (campus / volunteer / club)
    (p.practice || []).forEach((prac, i) => {
        const sub = prac.role || '成员';
        push(`practice-${i}`, 'practice', prac.org || '实践经历', sub, '🌱', prac);
    });

    // 6. 其他 (语言/证书/技能/荣誉/自我评价)
    const o = p.others || {};
    const hasOthers = (o.skills?.length || o.languages?.length ||
                       o.certifications?.length || o.honors?.length || o.summary);
    if (hasOthers) {
        const parts = [];
        if (o.languages?.length)      parts.push(`语言×${o.languages.length}`);
        if (o.certifications?.length) parts.push(`证书×${o.certifications.length}`);
        if (o.skills?.length)         parts.push(`技能×${o.skills.length}`);
        if (o.honors?.length)         parts.push(`荣誉×${o.honors.length}`);
        push('others', 'others', '其他信息', parts.join(' · ') || '技能/证书/语言', '⚡', o);
    }

    // Fallback
    if (state.modules.length === 0 && state.resumeText) {
        push('fulltext', 'project', '简历全文', '手动优化', '📄', {
            title:'简历全文', role:'', time:'', tech:'',
            bullets: state.resumeText.split('\n').filter(l=>l.trim().length>5).slice(0,20)
        });
    }
}

function renderModuleList() {
    const list = document.getElementById('moduleList');
    list.innerHTML = '';

    state.modules.forEach((mod, idx) => {
        const el = document.createElement('div');
        el.className = 'module-item' + (mod.type === 'basic' ? ' module-basic' : '');
        el.dataset.idx = idx;
        const statusDot = mod.type === 'basic'
            ? '<div class="module-status-dot info" title="无需优化"></div>'
            : `<div class="module-status-dot ${mod.status === 'done' ? 'done' : mod.status === 'skipped' ? 'skipped' : ''}"></div>`;
        el.innerHTML = `
            <span class="module-item-icon">${mod.icon}</span>
            <div class="module-item-info">
                <div class="module-item-title">${escHtml(mod.label)}</div>
                <div class="module-item-sub">${escHtml(mod.sublabel)}</div>
            </div>
            ${statusDot}
        `;
        el.addEventListener('click', () => selectModule(idx));
        list.appendChild(el);
    });

    updateSidebarProgress();
}

function selectModule(idx) {
    state.currentModuleIdx = idx;
    const mod = state.modules[idx];

    // Update active state in list
    document.querySelectorAll('.module-item').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
    });

    document.getElementById('moduleEmpty').style.display = 'none';
    document.getElementById('moduleContentArea').style.display = 'flex';

    // Badge & title
    const typeLabels = {
        basic:'基本信息', education:'教育', internship:'实习', project:'项目',
        practice:'实践', others:'其他', skills:'技能', honors:'荣誉', summary:'总结'
    };
    document.getElementById('mcaBadge').textContent = typeLabels[mod.type] || mod.type;
    document.getElementById('mcaTitle').textContent = mod.label;

    // Current content
    const contentEl = document.getElementById('currentContentBox');
    contentEl.textContent = getModuleContentText(mod);

    // JD keyword coverage (center panel)
    renderKwCoverage(mod);

    // Refresh JD ref panel keyword colors to reflect current module
    updateJDRefPanel();

    // Match score
    const pct = calcModuleMatch(mod);
    document.getElementById('mcaMatchFill').style.width = pct + '%';
    document.getElementById('mcaMatchPct').textContent = pct + '%';

    // AI suggestions (reset)
    document.getElementById('aiIdleBox').style.display = '';
    document.getElementById('aiLoadingBox').style.display = 'none';
    document.getElementById('aiContentBox').style.display = 'none';

    // If already done, show result
    if (mod.status === 'done' && mod.optimizedContent) {
        document.getElementById('aiIdleBox').style.display = 'none';
        document.getElementById('aiContentBox').style.display = '';
        document.getElementById('aiContentBox').innerHTML = `<div style="background:#f0f8d8;border:1.5px solid #c8e8a0;border-radius:8px;padding:16px;font-size:14px;line-height:1.75;white-space:pre-wrap">${escHtml(mod.optimizedContent)}</div><div style="margin-top:12px;font-size:12px;color:var(--muted)">✓ 已优化确认</div>`;
    }
}

function getModuleContentText(mod) {
    const d = mod.data;
    if (mod.type === 'basic') {
        const lines = [];
        if (d.name)     lines.push(`姓名：${d.name}`);
        if (d.phone)    lines.push(`电话：${d.phone}`);
        if (d.email)    lines.push(`邮箱：${d.email}`);
        if (d.location) lines.push(`所在地：${d.location}`);
        if (d.other)    lines.push(d.other);
        return lines.join('\n');
    }
    if (mod.type === 'education') {
        const header = [d.school, [d.degree, d.major].filter(Boolean).join(' · '), d.time].filter(Boolean);
        let text = header.join('\n');
        if (d.minor)   text += `\n副修：${d.minor}`;
        if (d.gpa)     text += `\nGPA: ${d.gpa}`;
        if (d.rank)    text += `\n排名: ${d.rank}`;
        if (d.awards)  text += `\n奖项: ${d.awards}`;
        if (d.courses) text += `\n相关课程: ${d.courses}`;
        if (d.notes)   text += `\n备注: ${d.notes}`;
        return text;
    }
    if (mod.type === 'internship') {
        const header = [d.company, d.position, d.department, d.time].filter(Boolean).join(' | ');
        let text = header;
        if (d.bullets?.length) text += '\n' + d.bullets.map(b => `• ${b}`).join('\n');
        return text;
    }
    if (mod.type === 'project') {
        const header = [d.title, d.role, d.time].filter(Boolean).join(' | ');
        let text = header;
        if (d.tech)            text += `\n技术/工具: ${d.tech}`;
        if (d.bullets?.length) text += '\n' + d.bullets.map(b => `• ${b}`).join('\n');
        return text;
    }
    if (mod.type === 'practice') {
        const header = [d.org, d.role, d.time].filter(Boolean).join(' | ');
        let text = header;
        if (d.bullets?.length) text += '\n' + d.bullets.map(b => `• ${b}`).join('\n');
        return text;
    }
    if (mod.type === 'others') {
        const parts = [];
        if (d.skills?.length)         parts.push(`【技能】${d.skills.join('、')}`);
        if (d.languages?.length)      parts.push(`【语言】${d.languages.join('、')}`);
        if (d.certifications?.length) parts.push(`【证书】${d.certifications.join('、')}`);
        if (d.honors?.length)         parts.push(`【荣誉】${d.honors.join('、')}`);
        if (d.summary)                parts.push(`【自我评价】${d.summary}`);
        return parts.join('\n');
    }
    return '';
}

function renderKwCoverage(mod) {
    const row = document.getElementById('kwCoverageRow');
    const jdSkills = state.jdParsed?.skills || [];
    const content = getModuleContentText(mod).toLowerCase();

    row.innerHTML = jdSkills.slice(0, 12).map(skill => {
        const hit = content.includes(skill.toLowerCase());
        return `<span class="${hit ? 'kw-hit' : 'kw-miss'}">${skill}</span>`;
    }).join('');

    if (!jdSkills.length) row.innerHTML = '<span style="color:var(--muted);font-size:13px">暂无JD关键词</span>';
}

function calcModuleMatch(mod) {
    const jdSkills = state.jdParsed?.skills || [];
    if (!jdSkills.length) return 0;
    const content = getModuleContentText(mod).toLowerCase();
    const hit = jdSkills.filter(s => content.includes(s.toLowerCase()));
    return Math.round((hit.length / jdSkills.length) * 100);
}

function updateJDRefPanel() {
    const p = state.jdParsed;
    document.getElementById('jdRefName').textContent = p?.title || '—';

    // Keywords with hit/miss coloring vs current module
    const tags = document.getElementById('jdRefTags');
    const mod = state.currentModuleIdx >= 0 ? state.modules[state.currentModuleIdx] : null;
    const modContent = mod ? getModuleContentText(mod).toLowerCase() : '';
    tags.innerHTML = (p?.skills || []).map(s => {
        const hit = modContent && modContent.includes(s.toLowerCase());
        return `<div class="jd-ref-tag ${hit ? 'jd-tag-hit' : ''}">${s}</div>`;
    }).join('');

    // Full JD text
    const fullEl = document.getElementById('jdFullText');
    if (fullEl && p?.fullText) {
        fullEl.textContent = p.fullText;
    }

    updateOverallMatch();
}

function toggleJDFull() {
    const el  = document.getElementById('jdFullText');
    const btn = document.getElementById('jdToggleBtn');
    if (!el) return;
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : '';
    btn.textContent  = open ? '展开 ↓' : '收起 ↑';
}

function updateOverallMatch() {
    const jdSkills = state.jdParsed?.skills || [];
    if (!jdSkills.length) return;
    const allContent = state.resumeText.toLowerCase();
    const hit = jdSkills.filter(s => allContent.includes(s.toLowerCase()));
    const pct = Math.round((hit.length / jdSkills.length) * 100);
    document.getElementById('omScore').textContent = pct + '%';
}

function updateSidebarProgress() {
    // Exclude 'basic' from count — it needs no optimization
    const optimizable = state.modules.filter(m => m.type !== 'basic');
    const done  = optimizable.filter(m => m.status === 'done').length;
    const total = optimizable.length;
    const pct   = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('sidebarFill').style.width = pct + '%';
    document.getElementById('sidebarLabel').textContent = `${done} / ${total} 已优化`;
    document.getElementById('step3Next').disabled = done === 0;
}

// Find next module that can be optimized (skips 'basic')
function findNextOptimizableIdx(currentIdx) {
    for (let i = currentIdx + 1; i < state.modules.length; i++) {
        if (state.modules[i].type !== 'basic') return i;
    }
    return -1;
}

function skipModule() {
    if (state.currentModuleIdx < 0) return;
    state.modules[state.currentModuleIdx].status = 'skipped';
    renderModuleList();
    updateSidebarProgress();

    // Auto-select next optimizable module
    const next = findNextOptimizableIdx(state.currentModuleIdx);
    if (next >= 0) selectModule(next);

    showToast('已跳过此模块');
}

// ===== OPTIMIZE FLOW MODAL =====
// Multi-turn conversational flow:
// Step 1: AI diagnosis (instant analysis of the module)
// Step 2: AI-guided Q&A (like a smart interviewer)
// Step 3: AI generation with full context
// Step 4: Review & confirm

let flowCurrentStep = 1;
let flowDiagnosis   = null;   // AI diagnosis result from step 1
let flowChat        = [];     // Q&A history for step 2
let flowPendingQ    = null;   // current AI question waiting for answer

function openOptimizeFlow() {
    flowCurrentStep = 1;
    flowDiagnosis   = null;
    flowChat        = [];
    flowPendingQ    = null;
    state.flowResult = null;

    // Reset step 3 UI
    document.getElementById('generatingArea').style.display = '';
    document.getElementById('compareArea').style.display = 'none';
    document.getElementById('rewriteExplain').style.display = 'none';
    document.getElementById('matchedKwRow').style.display = 'none';

    // Reset next button
    const nextBtn = document.getElementById('flowNextBtn');
    nextBtn.disabled = false;
    nextBtn.textContent = '下一步 →';

    const mod = state.modules[state.currentModuleIdx];
    document.getElementById('optimizeModalTitle').textContent = `优化：${mod?.label || ''}`;

    renderFlowStep(1);
    document.getElementById('optimizeModal').style.display = 'flex';

    // Immediately trigger AI diagnosis in step 1
    if (state.serverInfo.ai_ready && mod) {
        runAIDiagnosis(mod);
    }
}

function closeOptimizeModal() {
    document.getElementById('optimizeModal').style.display = 'none';
    state.flowResult = null;
    flowDiagnosis = null;
    flowChat = [];
}

function handleOptimizeBackdropClick(e) {
    if (e.target === document.getElementById('optimizeModal')) closeOptimizeModal();
}

function renderFlowStep(step) {
    flowCurrentStep = step;

    document.querySelectorAll('.flow-step').forEach(el => {
        const s = +el.dataset.s;
        el.classList.remove('active','done');
        if (s === step) el.classList.add('active');
        else if (s < step) el.classList.add('done');
    });

    document.querySelectorAll('.flow-panel').forEach((p, i) => {
        p.classList.toggle('active', i + 1 === step);
    });

    const prev = document.getElementById('flowPrevBtn');
    prev.style.display = step > 1 ? '' : 'none';

    const next = document.getElementById('flowNextBtn');
    if (!next.disabled) {
        if (step === 4)      next.textContent = '✓ 确认采用';
        else if (step === 3) next.textContent = state.flowResult ? '确认结果 →' : 'AI生成中...';
        else                 next.textContent = '下一步 →';
    }

    if (step === 1) renderStep1Shell();
    if (step === 2) renderStep2Chat();
}

// ── Step 1: AI Diagnosis ─────────────────────────────────────────────────────
function renderStep1Shell() {
    const mod = state.modules[state.currentModuleIdx];
    if (!mod) return;
    document.getElementById('originalBox').textContent = getModuleContentText(mod);

    const listEl = document.getElementById('completenessItems');
    const hint   = document.getElementById('completenessHint');

    if (flowDiagnosis) {
        renderDiagnosis(flowDiagnosis);
    } else {
        listEl.innerHTML = `<div class="diag-loading">
            <span class="parse-spinner" style="display:inline-block;margin-right:8px"></span>
            AI正在分析你的${mod.label}...
        </div>`;
        hint.style.display = 'none';
    }
}

async function runAIDiagnosis(mod) {
    const text    = getModuleContentText(mod);
    const jd      = state.jdParsed;
    const jdText  = jd?.fullText
        ? jd.fullText.slice(0, 400)
        : `${jd?.title || ''} ${jd?.skills?.slice(0,8).join('、') || ''}`;
    const currentYear = new Date().getFullYear();

    const sysPrompt = `你是资深HR简历诊断专家。当前年份：${currentYear}年。
请对候选人的简历模块进行专业诊断，输出严格JSON，不要有任何额外文字：
{
  "score": 0~100的整数（当前模块质量分）,
  "verdict": "一句话总体评价（15字内）",
  "issues": [
    {"type": "error|warning|info", "text": "具体问题描述（20字内）"}
  ],
  "missing": ["缺少的信息点1"],
  "strength": "该模块最大亮点（如有，否则空字符串）",
  "first_question": "基于该模块原文内容，你会追问候选人的第一个问题（口语化，20字内，必须和原文内容相关）"
}
诊断维度：量化数据、STAR结构、动词力度、JD匹配、信息完整性。
注意：first_question必须基于模块原文中已有的内容来追问，不要问原文中根本没提到的事情。`;

    const userMsg = `目标岗位：${jdText}\n\n简历模块（${mod.type}）原文：\n${text}`;

    try {
        const resp = await fetch(`${API_BASE}/api/ai_chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: sysPrompt },
                    { role: 'user',   content: userMsg }
                ],
                temperature: 0.2,
                max_tokens: 600
            })
        });
        const data = await resp.json();
        let raw = data.choices?.[0]?.message?.content || '';
        raw = raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```\s*$/,'').trim();
        flowDiagnosis = JSON.parse(raw);
    } catch(e) {
        flowDiagnosis = localDiagnosis(mod);
    }

    // If still on step 1, update the display
    if (flowCurrentStep === 1) renderDiagnosis(flowDiagnosis);
}

function localDiagnosis(mod) {
    const text   = getModuleContentText(mod);
    const issues = [];

    // Type-specific checks
    if (mod.type === 'internship' || mod.type === 'project' || mod.type === 'practice') {
        if (!/\d+%|\d+万|\d+倍|\d+个|\d+次|\d+人/.test(text))
            issues.push({ type:'error',   text:'缺少量化数据，无法体现成果规模' });
        if ((mod.data.bullets?.length || 0) < 2)
            issues.push({ type:'warning', text:'描述条数不足，建议至少2条' });
        if (!/主导|负责|设计|构建|推进|优化|实现|完成|组织|策划|带领/.test(text))
            issues.push({ type:'warning', text:'动词力度较弱，建议用强动词开头' });
    } else if (mod.type === 'education') {
        if (!mod.data.gpa && !mod.data.rank)
            issues.push({ type:'info',    text:'可补充GPA或专业排名增强说服力' });
        if (!mod.data.awards)
            issues.push({ type:'info',    text:'可补充奖学金或荣誉经历' });
        if (!mod.data.courses)
            issues.push({ type:'info',    text:'可补充与目标岗位相关的核心课程' });
    } else if (mod.type === 'others') {
        const o = mod.data;
        if (!o.languages?.length)
            issues.push({ type:'info',    text:'建议补充语言能力（英语等级/分数）' });
        if (!o.skills?.length)
            issues.push({ type:'warning', text:'缺少技能列表，影响ATS关键词匹配' });
    } else if (mod.type === 'basic') {
        if (!mod.data.email)   issues.push({ type:'error',   text:'缺少邮箱联系方式' });
        if (!mod.data.phone)   issues.push({ type:'warning', text:'建议补充电话号码' });
    }

    // JD keyword match check (for content modules)
    if (['internship','project','practice','others'].includes(mod.type)) {
        const jdSkills = state.jdParsed?.skills || [];
        const hit = jdSkills.filter(s => text.toLowerCase().includes(s.toLowerCase()));
        if (jdSkills.length > 3 && hit.length < 2)
            issues.push({ type:'warning', text:`JD关键词覆盖低（${hit.length}/${jdSkills.length}个）` });
    }

    const qMap = {
        basic:      '你的LinkedIn或个人主页有吗？有没有作品集链接可以补充？',
        internship: '在这段实习中，你最有成就感的一件事是什么？能给个具体数字吗？',
        project:    '这个项目的核心挑战是什么？你是怎么解决的？最终结果如何？',
        education:  '你的专业课成绩如何？有没有拿过奖学金或参加过竞赛？',
        practice:   '在这个经历里，你带领或负责过什么具体的事情？规模有多大？',
        others:     '你最擅长哪项技能？有没有在具体项目里用过的经历可以补充？',
    };
    return {
        score:          issues.length === 0 ? 78 : Math.max(35, 78 - issues.length * 11),
        verdict:        issues.length === 0 ? '内容完整，可进一步提升' : `发现${issues.length}处可改进点`,
        issues,
        missing:        [],
        strength:       '',
        first_question: qMap[mod.type] || '能描述一下这段经历中最重要的贡献吗？'
    };
}

function renderDiagnosis(diag) {
    if (!diag) return;
    const listEl = document.getElementById('completenessItems');
    const hint   = document.getElementById('completenessHint');

    const scoreColor = diag.score >= 75 ? '#27ae60' : diag.score >= 55 ? '#f39c12' : '#e74c3c';
    let html = `<div class="diag-header">
        <div class="diag-score" style="color:${scoreColor}">${diag.score}<span>分</span></div>
        <div class="diag-verdict">${escHtml(diag.verdict)}</div>
    </div>`;

    if (diag.strength) {
        html += `<div class="diag-strength">💪 ${escHtml(diag.strength)}</div>`;
    }

    if (diag.issues?.length) {
        html += diag.issues.map(issue => {
            const icon = issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️';
            return `<div class="completeness-item"><span class="ci-icon">${icon}</span><span class="ci-text">${escHtml(issue.text)}</span></div>`;
        }).join('');
    }

    listEl.innerHTML = html;

    if (diag.first_question) {
        hint.style.display = '';
        hint.innerHTML = `<div class="diag-hint-q">🤖 AI要问你：<em>${escHtml(diag.first_question)}</em></div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px">点「下一步」进入补充信息环节</div>`;
        // Store first question for step 2
        flowPendingQ = diag.first_question;
    } else {
        hint.style.display = 'none';
    }
}

// ── Step 2: Multi-turn AI Interview ─────────────────────────────────────────
function renderStep2Chat() {
    const mod = state.modules[state.currentModuleIdx];
    const chatEl = document.getElementById('flowChatArea');
    if (!chatEl) return;

    chatEl.innerHTML = '';

    // If AI is available: show chat UI
    if (state.serverInfo.ai_ready) {
        // Show any existing chat history
        flowChat.forEach(msg => appendChatBubble(msg.role, msg.content));

        // If no messages yet, show the first question from diagnosis
        if (flowChat.length === 0 && flowPendingQ) {
            appendChatBubble('ai', flowPendingQ);
            flowChat.push({ role: 'ai', content: flowPendingQ });
        } else if (flowChat.length === 0) {
            const fallbackQ = getFirstQuestion(mod);
            appendChatBubble('ai', fallbackQ);
            flowChat.push({ role: 'ai', content: fallbackQ });
        }

        // Show input area
        document.getElementById('flowChatInputArea').style.display = '';
        document.getElementById('flowLegacyForm').style.display = 'none';
    } else {
        // Fallback: show legacy form
        document.getElementById('flowChatInputArea').style.display = 'none';
        document.getElementById('flowLegacyForm').style.display = '';
    }
}

function getFirstQuestion(mod) {
    const qMap = {
        basic:      '你的LinkedIn主页或个人作品集有链接可以补充吗？',
        internship: '请描述这段实习的工作内容——你主要负责什么？有没有具体成果？',
        project:    '这个项目是什么背景下做的？你的核心贡献是什么？最终结果如何？',
        education:  '你的GPA或专业排名如何？有获得过奖学金或参加过竞赛吗？',
        practice:   '在这个经历中你担任什么角色？带领或组织过什么活动？规模多大？',
        others:     '你在项目中实际用过哪些工具/技能？能举一个最有代表性的例子吗？',
    };
    return qMap[mod.type] || '能描述一下你在这段经历中最有成就感的事情吗？';
}

function appendChatBubble(role, text) {
    const chatEl = document.getElementById('flowChatArea');
    if (!chatEl) return;
    const div = document.createElement('div');
    div.className = `chat-bubble chat-${role}`;
    div.innerHTML = role === 'ai'
        ? `<span class="chat-avatar">🤖</span><div class="chat-text">${escHtml(text)}</div>`
        : `<div class="chat-text">${escHtml(text)}</div><span class="chat-avatar">👤</span>`;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('flowChatInput');
    const msg   = input.value.trim();
    if (!msg) return;
    input.value = '';

    // Show user bubble
    appendChatBubble('user', msg);
    flowChat.push({ role: 'user', content: msg });

    // Disable send while AI thinks
    const sendBtn = document.getElementById('flowChatSendBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    // Get next AI question or signal "enough info"
    const nextQ = await getNextAIQuestion(msg);

    sendBtn.disabled = false;
    sendBtn.textContent = '发送';

    if (nextQ === '__DONE__') {
        // AI has enough info, show "proceed" hint
        appendChatBubble('ai', '好的，我已经了解足够信息了！点击「下一步」让我为你生成优化版本 ✨');
        flowChat.push({ role: 'ai', content: '好的，信息收集完毕，可以生成了！' });
        document.getElementById('flowNextBtn').textContent = '生成优化内容 →';
    } else {
        appendChatBubble('ai', nextQ);
        flowChat.push({ role: 'ai', content: nextQ });
    }
}

// Handle Enter key in chat input
function handleChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
}

async function getNextAIQuestion(userAnswer) {
    const mod = state.modules[state.currentModuleIdx];
    const original = getModuleContentText(mod);
    const jd = state.jdParsed;

    const history = flowChat.map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content
    }));
    // Add the latest user answer
    history.push({ role: 'user', content: userAnswer });

    const sysPrompt = `你是一位经验丰富的职业顾问，正在帮候选人挖掘简历经历的深度细节。
当前年份：${new Date().getFullYear()}年。

你的目标：通过1-3个追问，补全以下信息缺口，以便生成高质量简历描述。
缺口优先级：① 量化数据（数字/规模/比例）② 个人具体贡献 ③ 使用的方法/工具 ④ 结果影响

规则：
1. 追问必须基于【简历原文】中已有的内容，不要问原文里没有的事情
2. 追问要口语化、具体、20字以内
3. 如已有足够信息（有量化+有具体行动+有结果），输出：__DONE__
4. 最多追问3次，第3次后必须输出__DONE__
5. 只输出追问文字或__DONE__，不要有其他内容

当前对话轮数：${Math.floor(flowChat.length / 2)}
【简历模块原文】：${original}
【目标岗位】：${jd?.title || ''} ${jd?.skills?.slice(0,5).join('、') || ''}
【JD核心要求】：${jd?.requirements?.slice(0,3).join('；') || ''}`;

    try {
        const resp = await fetch(`${API_BASE}/api/ai_chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'system', content: sysPrompt }, ...history],
                temperature: 0.5,
                max_tokens: 100
            })
        });
        const data = await resp.json();
        const reply = data.choices?.[0]?.message?.content?.trim() || '__DONE__';
        return reply.includes('__DONE__') ? '__DONE__' : reply;
    } catch(e) {
        return '__DONE__';
    }
}

async function flowNext() {
    const btn = document.getElementById('flowNextBtn');

    if (flowCurrentStep === 1) {
        // Ensure diagnosis is done before proceeding
        if (!flowDiagnosis && state.serverInfo.ai_ready) {
            showToast('AI分析中，请稍候...');
            return;
        }
        renderFlowStep(2);

    } else if (flowCurrentStep === 2) {
        renderFlowStep(3);
        btn.disabled = true;
        btn.textContent = 'AI生成中...';
        try { await generateAI(); } catch(e) { console.error(e); }
        btn.disabled = false;
        btn.textContent = '确认结果 →';

    } else if (flowCurrentStep === 3) {
        if (!state.flowResult) { showToast('请等待AI生成完成'); return; }
        renderFlowStep4();
        renderFlowStep(4);

    } else if (flowCurrentStep === 4) {
        applyOptimization();
    }
}

function flowPrev() {
    if (flowCurrentStep > 1) renderFlowStep(flowCurrentStep - 1);
}

function renderFlowStep4() {
    document.getElementById('confirmContentBox').textContent = state.flowResult || '';
    document.getElementById('confirmEditArea').value = state.flowResult || '';
    document.getElementById('confirmEditArea').style.display = 'none';
    document.getElementById('confirmContentBox').style.display = '';
}

function switchToEdit() {
    const box  = document.getElementById('confirmContentBox');
    const area = document.getElementById('confirmEditArea');
    if (area.style.display === 'none') {
        area.value = box.textContent;
        area.style.display = '';
        box.style.display = 'none';
    } else {
        box.textContent = area.value;
        box.style.display = '';
        area.style.display = 'none';
    }
}

function applyOptimization() {
    const editArea   = document.getElementById('confirmEditArea');
    const contentBox = document.getElementById('confirmContentBox');
    const finalContent = editArea.style.display === 'none' ? contentBox.textContent : editArea.value;

    const mod = state.modules[state.currentModuleIdx];
    mod.status = 'done';
    mod.optimizedContent = finalContent;
    state.flowResult = null;

    renderModuleList();
    updateSidebarProgress();
    closeOptimizeModal();

    document.getElementById('aiIdleBox').style.display = 'none';
    document.getElementById('aiContentBox').style.display = '';
    document.getElementById('aiContentBox').innerHTML =
        `<div style="background:#f0f8d8;border:1.5px solid #c8e8a0;border-radius:8px;padding:16px;font-size:14px;line-height:1.75;white-space:pre-wrap">${escHtml(finalContent)}</div>
         <div style="margin-top:12px;font-size:12px;color:var(--muted)">✓ 已优化确认</div>`;
    showToast('✓ 优化已保存');

    const next = findNextOptimizableIdx(state.currentModuleIdx);
    if (next >= 0) setTimeout(() => selectModule(next), 400);
}

// ===== AI GENERATION =====
async function generateAI() {
    state.flowResult = null;
    document.getElementById('generatingArea').style.display = '';
    document.getElementById('compareArea').style.display = 'none';
    document.getElementById('rewriteExplain').style.display = 'none';
    document.getElementById('matchedKwRow').style.display = 'none';

    // Animated steps
    const steps = ['gs1','gs2','gs3','gs4'];
    let stepIdx = 0, stepTimer = null;
    const advanceStep = () => {
        document.querySelectorAll('.gen-step').forEach(s => s.classList.remove('active'));
        if (stepIdx < steps.length) {
            document.getElementById(steps[stepIdx])?.classList.add('active');
            stepIdx++;
            stepTimer = setTimeout(advanceStep, 1200);
        }
    };
    advanceStep();

    const mod      = state.modules[state.currentModuleIdx];
    const jdSkills = state.jdParsed?.skills || [];

    // Gather supplemental info from chat history OR legacy form
    let suppInfo = '';
    if (flowChat.length > 0) {
        // Use conversation transcript as context
        suppInfo = flowChat
            .filter(m => m.role === 'user')
            .map(m => m.content)
            .join('\n');
    } else {
        // Fallback: legacy form fields
        const bg  = document.getElementById('suppBackground')?.value?.trim() || '';
        const rl  = document.getElementById('suppRole')?.value?.trim() || '';
        const tl  = document.getElementById('suppTools')?.value?.trim() || '';
        const rs  = document.getElementById('suppResults')?.value?.trim() || '';
        suppInfo = [bg, rl, tl, rs].filter(Boolean).join('\n');
    }

    try {
        let optimized;
        if (state.serverInfo.ai_ready) {
            optimized = await callAI(mod, suppInfo, jdSkills);
        } else {
            await sleep(2400);
            optimized = generateFallback(mod, suppInfo, jdSkills);
        }

        clearTimeout(stepTimer);
        document.querySelectorAll('.gen-step').forEach(s => s.classList.add('active'));
        state.flowResult = optimized;
        await sleep(300);
        document.getElementById('generatingArea').style.display = 'none';

        document.getElementById('compareBefore').textContent = getModuleContentText(mod);
        document.getElementById('compareAfter').textContent  = optimized;
        document.getElementById('compareArea').style.display = '';

        const matched = jdSkills.filter(s => optimized.toLowerCase().includes(s.toLowerCase()));
        if (matched.length) {
            document.getElementById('matchedKwRow').style.display = '';
            document.getElementById('matchedKwTags').innerHTML =
                matched.map(s => `<span class="kw-tag">${escHtml(s)}</span>`).join('');
        }

        // Build explain list based on what changed
        const explains = buildExplainPoints(mod, optimized, jdSkills);
        document.getElementById('rewriteExplain').style.display = '';
        document.getElementById('explainList').innerHTML = explains.map(t => `<li>${t}</li>`).join('');

    } catch(err) {
        clearTimeout(stepTimer);
        console.error('generateAI error:', err);
        const fallback = generateFallback(mod, suppInfo, jdSkills);
        state.flowResult = fallback;
        document.getElementById('generatingArea').style.display = 'none';
        document.getElementById('compareBefore').textContent = getModuleContentText(mod);
        document.getElementById('compareAfter').textContent  = fallback;
        document.getElementById('compareArea').style.display = '';
        document.getElementById('rewriteExplain').style.display = '';
        document.getElementById('explainList').innerHTML =
            `<li style="color:#c0392b">⚠️ AI请求失败：${escHtml(err.message)}</li><li>以下为本地模板生成，可手动编辑</li>`;
        showToast('⚠️ AI请求失败，已使用模板生成');
    }
}

function buildExplainPoints(mod, optimized, jdSkills) {
    const points = [];
    const orig = getModuleContentText(mod);
    const hasNewNumbers = /\d+%|\d+万|\d+个|\d+倍|\d+人/.test(optimized) && !/\d+%|\d+万|\d+个|\d+倍|\d+人/.test(orig);
    const hasStrongVerb = /主导|构建|设计|推进|驱动|优化|实现|完成|搭建|统筹|组织|策划/.test(optimized);
    const matched = jdSkills.filter(s => optimized.toLowerCase().includes(s.toLowerCase()));

    if (hasStrongVerb)       points.push('✅ 动词升级：用"主导/构建/推进"等强动词替换模糊表述');
    if (hasNewNumbers)       points.push('✅ 量化补充：根据你提供的信息添加了量化成果数据');
    if (matched.length >= 2) points.push(`✅ JD匹配：自然融入 ${matched.slice(0,3).join('、')} 等关键词`);
    if (['internship','project','practice'].includes(mod.type)) {
        points.push('✅ STAR结构：优化为 背景→任务→行动→结果 的清晰叙事逻辑');
        points.push('✅ XYZ公式校验：通过做X，在Y条件下，实现Z结果');
    } else if (mod.type === 'education') {
        points.push('✅ 教育模块：突出与目标岗位相关的课程、奖项和能力');
    } else if (mod.type === 'others') {
        points.push('✅ 技能重排：优先展示与JD匹配度最高的技能');
    }
    if (!points.length) points.push('✅ 表达优化：语言更清晰，结构更有逻辑');
    return points;
}

async function callAI(mod, suppInfo, jdSkills) {
    const original  = getModuleContentText(mod);
    const jd        = state.jdParsed;
    const jdContext = jd?.fullText
        ? jd.fullText.slice(0, 1500)
        : `岗位：${jd?.title || '目标岗位'}\n关键词：${jdSkills.join('、')}`;

    // Chat context from step 2 interview
    const chatContext = flowChat.length > 0
        ? '\n\n【候选人补充信息（来自AI访谈）】：\n' +
          flowChat.filter(m => m.role === 'user').map((m,i) => `Q${i+1}回答：${m.content}`).join('\n')
        : suppInfo ? `\n\n【候选人补充信息】：\n${suppInfo}` : '';

    const modTypeLabel = { internship:'实习经历', project:'项目经历', education:'教育背景',
                           practice:'实践经历', others:'其他信息', basic:'基本信息' };

    const currentYear = new Date().getFullYear();

    const systemPrompt = `你是一位顶级简历优化专家。当前年份是${currentYear}年。

【绝对禁止——违反即失败】
1. 禁止添加任何简历原文中没有的内容（不能编造公司名、项目名、学校、技能、证书、数字）
2. 禁止在优化实习/项目模块时插入教育背景信息
3. 禁止在优化实习/项目模块时插入技能列表
4. 只优化当前模块，不输出其他模块的内容
5. 如原文没有量化数字，用"显著提升""大幅缩短"等描述，不能捏造具体百分比

【优化方法论】
- STAR法则：背景→任务→行动→结果
- XYZ公式：通过做X，在Y条件下，实现Z结果
- 强动词开头：主导/构建/推进/设计/优化（而非负责/参与/协助）
- ATS关键词：自然融入JD中出现的关键词

【输出格式】
- 直接输出优化后的bullet points，无任何前缀或解释
- 3-5条，每条以强动词开头
- 只输出当前模块（${modTypeLabel[mod.type] || '该模块'}）的内容，不附加其他模块`;

    const userPrompt = `【目标岗位JD】：
${jdContext}

【当前${modTypeLabel[mod.type] || '模块'}原文（只优化这部分）】：
${original}
${chatContext}

请严格只优化上方"${modTypeLabel[mod.type] || '该模块'}原文"的内容，对标JD要求，不添加任何原文中没有的信息：`;

    const resp = await fetch(`${API_BASE}/api/ai_chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userPrompt }
            ],
            temperature: 0.65,
            max_tokens: 1200
        })
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err.error?.message) || 'AI请求失败 ' + resp.status);
    }
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI返回内容为空');
    return content;
}

function generateFallback(mod, suppInfo, jdSkills) {
    const kw  = jdSkills[0] || '核心业务';
    const kw2 = jdSkills[1] || '项目推进';

    if (mod.type === 'internship' || mod.type === 'project' || mod.type === 'practice') {
        const d       = mod.data;
        const bg      = suppInfo || '业务需求';
        const resMatch = suppInfo.match(/[\d]+[%万倍个次人天][^，。\n]{0,15}/);
        const res     = resMatch ? resMatch[0] : '提升工作效率';
        const entity  = mod.type === 'internship' ? d.company : mod.type === 'project' ? d.title : d.org;
        return `• 主导${entity || kw}相关工作，聚焦${bg.slice(0,18)}核心场景，完成需求分析与方案设计\n• 协同跨部门团队推进${kw2}落地，运用结构化方法拆解问题，按时完成阶段性交付\n• 量化成果：${res}，获得业务方/团队认可，经验推广复用\n• 沉淀${kw}方法论，为后续同类项目提供可参考模板`;
    }
    if (mod.type === 'education') {
        const d = mod.data;
        return [
            [d.school, [d.degree, d.major].filter(Boolean).join(' '), d.time].filter(Boolean).join(' | '),
            d.gpa    ? `GPA: ${d.gpa}` : '',
            d.rank   ? `专业排名: ${d.rank}` : '',
            d.awards ? `荣誉奖项: ${d.awards}` : '',
            d.courses? `核心课程: ${d.courses}` : '',
        ].filter(Boolean).join('\n');
    }
    if (mod.type === 'others') {
        const d = mod.data;
        const all = [...(d.skills||[]), ...(d.tools||[])];
        const missing = jdSkills.filter(s => !all.some(u => u.toLowerCase().includes(s.toLowerCase())));
        let text = getModuleContentText(mod);
        if (missing.length) text += `\n\n建议补充（基于JD）：${missing.slice(0,4).join('、')}`;
        return text;
    }
    if (mod.type === 'basic') {
        return getModuleContentText(mod);
    }
    return getModuleContentText(mod);
}
// ===== EXPORT =====
function renderExportPage() {
    const done = state.modules.filter(m => m.status === 'done');
    const jdSkills = state.jdParsed?.skills || [];
    const allContent = done.map(m => m.optimizedContent || '').join(' ').toLowerCase();
    const kwCount = jdSkills.filter(s => allContent.includes(s.toLowerCase())).length;

    // Rough final match
    const pct = jdSkills.length ? Math.round((kwCount / jdSkills.length) * 100) : 0;
    document.getElementById('exportScore').textContent = pct + '%';
    document.getElementById('exportOptCount').textContent = done.length;
    document.getElementById('exportKwCount').textContent = kwCount;
}

function toggleExportBtn() {
    const checked = document.getElementById('confirmAccuracy').checked;
    document.getElementById('finalExportBtn').disabled = !checked;
}

function exportResume(format) {
    const text = buildResumeText();

    if (format === 'copy') {
        navigator.clipboard.writeText(text)
            .then(() => showToast('✓ 已复制到剪贴板'))
            .catch(() => {
                // Fallback for browsers that block clipboard
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast('✓ 已复制到剪贴板');
            });
        return;
    }

    if (format === 'txt') {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, 'resume_jobaily.txt');
        return;
    }

    if (format === 'word') {
        const name = state.resumeParsed?.basic?.name || '简历';
        const jobTitle = state.jdParsed?.title || '';
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Normal</w:View>
<w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 2cm 2.5cm; }
  body { font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
         font-size: 10.5pt; line-height: 1.6; color: #1a1a1a; }
  h1   { font-size: 18pt; font-weight: bold; margin: 0 0 4pt 0;
         color: #0d0d0d; border-bottom: 2pt solid #0d0d0d; padding-bottom: 4pt; }
  .contact { font-size: 9.5pt; color: #555; margin-bottom: 16pt; }
  h2   { font-size: 12pt; font-weight: bold; color: #0d0d0d;
         border-bottom: 1pt solid #ccc; padding-bottom: 2pt;
         margin: 14pt 0 6pt 0; page-break-after: avoid; }
  .section-meta { font-size: 9.5pt; color: #666; margin-bottom: 4pt; }
  ul   { margin: 4pt 0 8pt 0; padding-left: 14pt; }
  li   { margin-bottom: 3pt; font-size: 10.5pt; line-height: 1.55; }
  p    { margin: 2pt 0; }
</style>
</head>
<body>${htmlFromResume()}</body>
</html>`;
        const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
        downloadBlob(blob, `${name}_简历${jobTitle ? '_' + jobTitle : ''}_JobAIly.doc`);
    }
}

function buildResumeText() {
    const p = state.resumeParsed;
    let text = '';

    if (p?.basic?.name) {
        text += `${p.basic.name}\n`;
        if (p.basic.phone) text += `${p.basic.phone}  `;
        if (p.basic.email) text += `${p.basic.email}`;
        text += '\n\n';
    }

    state.modules.forEach(mod => {
        const content = mod.optimizedContent || getModuleContentText(mod);
        text += `【${mod.label}】\n${content}\n\n`;
    });

    return text.trim();
}

function htmlFromResume() {
    const p = state.resumeParsed;
    let html = '';

    // Header: always from basic
    if (p?.basic?.name) {
        html += `<h1>${escHtml(p.basic.name)}</h1>`;
        const contacts = [p.basic.phone, p.basic.email, p.basic.location].filter(Boolean).map(escHtml);
        if (contacts.length) html += `<p class="contact">${contacts.join('  |  ')}</p>`;
    }

    state.modules.forEach(mod => {
        if (mod.type === 'basic') return; // already rendered above
        const content    = mod.optimizedContent || getModuleContentText(mod);
        const isOptimized = !!mod.optimizedContent;
        const bulletsFromContent = lines => '<ul>' + lines
            .map(l => `<li>${escHtml(l.replace(/^[•·\-*【】]\s*/,'').trim())}</li>`)
            .filter(l => l !== '<li></li>').join('') + '</ul>';

        html += `<h2>${escHtml(mod.label)}</h2>`;

        if (mod.type === 'education') {
            const d = mod.data;
            const meta = [d.school, [d.degree,d.major].filter(Boolean).join(' · '), d.time, d.gpa?'GPA '+d.gpa:''].filter(Boolean);
            html += `<p class="section-meta">${meta.map(escHtml).join(' &nbsp;|&nbsp; ')}</p>`;
            if (d.awards)  html += `<p style="font-size:13px">奖项：${escHtml(d.awards)}</p>`;
            if (d.courses) html += `<p style="font-size:13px">课程：${escHtml(d.courses)}</p>`;
            if (isOptimized) html += bulletsFromContent(content.split('\n').filter(l=>l.trim()));

        } else if (mod.type === 'others') {
            html += `<p>${escHtml(content.replace(/【[^】]+】/g,''))}</p>`;

        } else if (isOptimized) {
            // AI-optimized: smart split header vs bullets
            const lines = content.split('\n').filter(l=>l.trim());
            const firstIsBullet = /^[•·\-*]/.test(lines[0]||'');
            if (!firstIsBullet && lines.length > 1) {
                html += `<p class="section-meta"><strong>${escHtml(lines[0])}</strong></p>`;
                html += bulletsFromContent(lines.slice(1));
            } else {
                html += bulletsFromContent(lines);
            }

        } else {
            // Raw parsed data
            const d = mod.data;
            let meta = '';
            if (mod.type === 'internship') meta = [d.company, d.position, d.department, d.time].filter(Boolean).map(escHtml).join(' | ');
            if (mod.type === 'project')    meta = [d.title, d.role, d.time].filter(Boolean).map(escHtml).join(' | ');
            if (mod.type === 'practice')   meta = [d.org, d.role, d.time].filter(Boolean).map(escHtml).join(' | ');
            if (meta) html += `<p class="section-meta"><strong>${meta}</strong></p>`;
            if (d.bullets?.length) html += '<ul>' + d.bullets.map(b=>`<li>${escHtml(b)}</li>`).join('') + '</ul>';
        }
    });

    return html;
}

function doFinalExport() {
    exportResume('word');
    showToast('✓ 简历已导出为 Word 文件！');
}

function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}

function restartFlow() {
    state.resumeFile = null;
    state.resumeText = '';
    state.resumeParsed = null;
    state.jdText = '';
    state.jdParsed = null;
    state.modules = [];
    state.currentModuleIdx = -1;

    // Reset UI
    document.getElementById('uploadZone').style.display = '';
    document.getElementById('fileCard').style.display = 'none';
    document.getElementById('parsePreview').style.display = 'none';
    document.getElementById('step1Next').disabled = true;
    document.getElementById('jdInput').value = '';
    document.getElementById('jdPreviewEmpty').style.display = '';
    document.getElementById('jdKeywordsBox').style.display = 'none';
    document.getElementById('step2Next').disabled = true;
    document.getElementById('moduleList').innerHTML = '';
    document.getElementById('moduleEmpty').style.display = '';
    document.getElementById('moduleContentArea').style.display = 'none';
    document.getElementById('confirmAccuracy').checked = false;
    document.getElementById('finalExportBtn').disabled = true;
    document.getElementById('resumeFile').value = '';

    // Reset step indicators
    document.querySelectorAll('.step-item').forEach(el => {
        el.classList.remove('active', 'done');
        if (el.dataset.step === '1') el.classList.add('active');
    });
    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('step1').classList.add('active');
}

// ===== UTILS =====
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
}
