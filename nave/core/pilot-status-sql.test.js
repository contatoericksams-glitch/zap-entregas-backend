"use strict";
// Dry-run security gate for proposed migration, no database access.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const sql=fs.readFileSync(path.join(__dirname,"migrations/002_pilot_test_status_DRAFT.sql"),"utf8").toLowerCase();
test("RPC is boolean only and no personal fields returned",()=>{
 assert.match(sql,/returns boolean/);
 assert.doesNotMatch(sql,/returns table|returns setof|phone_e164/);
});
test("RPC requires authenticated MFA and admin",()=>{
 assert.match(sql,/auth\.uid\(\) is not null/);
 assert.match(sql,/auth\.jwt\(\).*?'aal'.*?'aal2'/s);
 assert.match(sql,/public\.nave_is_admin\(\)/);
});
test("RPC restricts execution to authenticated and search_path",()=>{
 assert.match(sql,/set search_path = ''/);
 assert.match(sql,/revoke all on function public\.nave_v5_pilot_test_status\(\) from public, anon, authenticated/);
 assert.match(sql,/grant execute on function public\.nave_v5_pilot_test_status\(\) to authenticated/);
});
test("RPC never modifies tables or dispatches drivers",()=>{
 assert.doesNotMatch(sql,/\b(insert into|update\s+public\.|delete from|drop table|alter table|http_post|sendwhatsapp)\b/i);
 assert.match(sql,/c\.is_test_only = true/);
 assert.match(sql,/c\.availability_state = 'online'/);
 assert.match(sql,/p\.driver_code = 'nave-0001'/);
});
