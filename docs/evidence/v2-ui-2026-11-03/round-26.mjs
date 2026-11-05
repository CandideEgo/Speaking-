const task = await taskSpace(1);
const page = task.page("p1");
const result = await page.evaluate(async () => {
  const raw = localStorage.getItem("seeword-auth");
  let token = null;
  try {
    const parsed = JSON.parse(raw || "{}");
    token = parsed?.state?.accessToken || parsed?.state?.token || parsed?.accessToken || null;
    if (!token) token = Object.values(parsed?.state || {}).find((v) => typeof v === "string" && v.split(".").length === 3) || null;
  } catch {}
  const id = new URL(location.href).searchParams.get("teaching_session_id");
  const response = await fetch(`/api/v1/teaching/sessions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await response.json();
  return { status: response.status, tokenFound: Boolean(token), json };
});
console.log(JSON.stringify(result, null, 2).slice(0, 4000));
