// ===============================
// 1. Supabase 설정
// ===============================
// Supabase 프로젝트를 만든 뒤 아래 두 값을 넣으세요.
// Project Settings → API에서 확인할 수 있습니다.
//
// SUPABASE_URL: https://xxxx.supabase.co
// SUPABASE_ANON_KEY: eyJ...
const SUPABASE_URL = "https://qxogiclmdiyvobbxwzjm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ktxfZAXp2SBbLj-MbUAfUQ_luMiU6yo";

const configured =
  !SUPABASE_URL.includes("여기에_") &&
  !SUPABASE_ANON_KEY.includes("여기에_");

const supabase = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let signupMode = false;

// ===============================
// 2. 기본 화면
// ===============================
const $ = (id) => document.getElementById(id);

function setAuthMessage(msg, ok = false) {
  $("auth-message").textContent = msg;
  $("auth-message").style.color = ok ? "#137333" : "#b42318";
}

function setRecordMessage(msg, ok = false) {
  $("record-message").textContent = msg;
  $("record-message").style.color = ok ? "#137333" : "#b42318";
}

function todayString() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

$("date").value = todayString();

$("login-tab").onclick = () => {
  signupMode = false;
  $("login-tab").classList.add("active");
  $("signup-tab").classList.remove("active");
  $("auth-button").textContent = "로그인";
  setAuthMessage("");
};

$("signup-tab").onclick = () => {
  signupMode = true;
  $("signup-tab").classList.add("active");
  $("login-tab").classList.remove("active");
  $("auth-button").textContent = "회원가입";
  setAuthMessage("");
};

// ===============================
// 3. 인증
// ===============================
$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!configured) {
    setAuthMessage("먼저 app.js에 Supabase URL과 Anon Key를 넣어주세요.");
    return;
  }

  const email = $("email").value.trim();
  const password = $("password").value;

  try {
    if (signupMode) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      setAuthMessage(
        "회원가입 완료! 이메일 확인이 켜져 있다면 메일 인증 후 로그인하세요.",
        true
      );
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      setAuthMessage("");
    }
  } catch (err) {
    setAuthMessage(err.message || "인증 중 오류가 발생했습니다.");
  }
});

$("logout-button").onclick = async () => {
  await supabase.auth.signOut();
};

async function showApp(user) {
  $("auth-card").classList.add("hidden");
  $("app-card").classList.remove("hidden");
  $("user-email").textContent = user.email;
  await loadRecords();
}

function showAuth() {
  $("app-card").classList.add("hidden");
  $("auth-card").classList.remove("hidden");
}

async function initAuth() {
  if (!configured) return;

  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    await showApp(data.session.user);
  } else {
    showAuth();
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      await showApp(session.user);
    } else {
      showAuth();
    }
  });
}

initAuth();

// ===============================
// 4. 수면시간 계산
// ===============================
function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function calculateSleepHours(bedtime, wakeTime) {
  let bed = timeToMinutes(bedtime);
  let wake = timeToMinutes(wakeTime);

  // 취침 후 자정을 넘기는 일반적인 상황
  if (wake <= bed) wake += 24 * 60;

  return (wake - bed) / 60;
}

function deficit(hours) {
  return Math.max(0, 8 - hours);
}

function formatHours(v) {
  return `${v.toFixed(2)}시간`;
}

// 취침 시각을 연속적인 값으로 바꿈.
// 예: 23:30 -> 23.5, 00:30 -> 24.5
function bedtimeValue(t) {
  const [h, m] = t.split(":").map(Number);
  let value = h + m / 60;
  if (value < 12) value += 24;
  return value;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) /
    values.length;
  return Math.sqrt(variance);
}

// ===============================
// 5. 기록 저장
// ===============================
$("sleep-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!supabase) {
    setRecordMessage("Supabase 설정이 필요합니다.");
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;

  if (!user) {
    setRecordMessage("로그인이 필요합니다.");
    return;
  }

  const date = $("date").value;
  const bedtime = $("bedtime").value;
  const wakeTime = $("wake-time").value;
  const conditionRaw = $("condition").value;
  const condition = conditionRaw === "" ? null : Number(conditionRaw);
  const sleepHours = calculateSleepHours(bedtime, wakeTime);
  const sleepDeficit = deficit(sleepHours);

  const record = {
    user_id: user.id,
    date,
    bedtime,
    wake_time: wakeTime,
    sleep_hours: Number(sleepHours.toFixed(2)),
    sleep_deficit: Number(sleepDeficit.toFixed(2)),
    condition
  };

  try {
    const { error } = await supabase
      .from("sleep_records")
      .upsert(record, { onConflict: "user_id,date" });

    if (error) throw error;

    setRecordMessage("수면 기록이 저장되었습니다.", true);
    await loadRecords();
  } catch (err) {
    setRecordMessage(err.message || "저장 중 오류가 발생했습니다.");
  }
});

// ===============================
// 6. 기록 불러오기
// ===============================
async function loadRecords() {
  if (!supabase) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return;

  const { data, error } = await supabase
    .from("sleep_records")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(30);

  if (error) {
    $("records-body").innerHTML =
      `<tr><td colspan="7">데이터를 불러오지 못했습니다: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  renderRecords(data || []);
  analyze(data || []);
}

function renderRecords(records) {
  const body = $("records-body");

  if (!records.length) {
    body.innerHTML =
      `<tr><td colspan="7">아직 기록이 없습니다.</td></tr>`;
    return;
  }

  body.innerHTML = records.map(r => `
    <tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.bedtime)}</td>
      <td>${escapeHtml(r.wake_time)}</td>
      <td>${Number(r.sleep_hours).toFixed(2)}h</td>
      <td>${Number(r.sleep_deficit).toFixed(2)}h</td>
      <td>${r.condition ?? "-"}</td>
      <td><button class="delete" onclick="deleteRecord('${r.id}')">삭제</button></td>
    </tr>
  `).join("");
}

async function deleteRecord(id) {
  if (!confirm("이 기록을 삭제할까요?")) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return;

  const { error } = await supabase
    .from("sleep_records")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    alert(error.message);
    return;
  }

  await loadRecords();
}

$("refresh-button").onclick = loadRecords;

// ===============================
// 7. 최근 7일 분석
// ===============================
function analyze(records) {
  const recent = records.slice(0, 7);

  if (!recent.length) {
    $("avg-sleep").textContent = "-";
    $("sleep-debt").textContent = "-";
    $("bedtime-std").textContent = "-";
    $("score").textContent = "-";
    $("analysis-text").textContent = "수면 기록을 1개 이상 입력해 주세요.";
    return;
  }

  const sleepValues = recent.map(r => Number(r.sleep_hours));
  const deficitValues = recent.map(r => Number(r.sleep_deficit));
  const bedtimeValues = recent.map(r => bedtimeValue(r.bedtime));

  const avgSleep =
    sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length;

  const debt = deficitValues.reduce((a, b) => a + b, 0);
  const bedtimeStd = standardDeviation(bedtimeValues);

  // 프로젝트용 점수 모델
  const durationScore = Math.min(100, (avgSleep / 8) * 100);
  const debtScore = Math.max(0, 100 - 10 * debt);
  const regularityScore = Math.max(0, 100 - 20 * bedtimeStd);

  const score =
    0.4 * durationScore +
    0.4 * debtScore +
    0.2 * regularityScore;

  $("avg-sleep").textContent = formatHours(avgSleep);
  $("sleep-debt").textContent = formatHours(debt);
  $("bedtime-std").textContent = `${bedtimeStd.toFixed(2)}시간`;
  $("score").textContent = `${Math.round(score)}점`;

  let advice = "";
  if (avgSleep < 8) {
    advice += "최근 평균 수면시간이 8시간보다 짧습니다. ";
  }
  if (bedtimeStd >= 1) {
    advice += "취침시간의 변동이 커서 일정한 취침시간을 유지하는 것이 좋습니다. ";
  }
  if (debt >= 3) {
    advice += "최근 7일 동안 수면 부족이 누적된 상태입니다. ";
  }
  if (!advice) {
    advice = "현재 입력된 데이터에서는 비교적 안정적인 수면 패턴입니다.";
  }

  $("analysis-text").textContent = advice;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
