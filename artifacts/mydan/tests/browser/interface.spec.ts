import {test,expect} from '@playwright/test';
import {setupUI,uiId} from './ui-fixture';

test('grouped admin overview keeps filters connected and balances desktop KPIs',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 const state=await setupUI(page);await page.goto('/admin');
 await expect(page.getByRole('heading',{name:'نظرة عامة على الميدان'})).toBeVisible();
 await expect(page.getByRole('region',{name:'مؤشرات الفترة'}).locator('.kpi')).toHaveCount(6);
 await page.getByRole('combobox',{name:'الفرع',exact:true}).selectOption(uiId(11));
 await expect.poll(()=>state.kpiRequests.at(-1)?.p_branch_id).toBe(uiId(11));
 await expect(page.getByRole('navigation',{name:'قائمة الإدارة'}).getByRole('region',{name:'النظام والأمان'})).toBeVisible();
 const heights=await page.locator('.overview-kpis .kpi').evaluateAll(elements=>elements.map(e=>Math.round(e.getBoundingClientRect().top)));
 expect(new Set(heights).size).toBe(2);expect(state.writes).toEqual([]);
});
test('user actions support keyboard dismissal and preserve credential protection',async({page})=>{
 const state=await setupUI(page);await page.goto('/admin/users');
 const trigger=page.getByRole('button',{name:'إجراءات أحمد محمد'});
 await trigger.focus();await page.keyboard.press('ArrowDown');
 await expect(page.getByRole('menu')).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'تعيين كلمة المرور',exact:true})).toBeFocused();
 await page.keyboard.press('End');await expect(page.getByRole('menuitem',{name:'حذف المستخدم نهائياً'})).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);await expect(trigger).toBeFocused();
 await page.getByRole('button',{name:'إجراءات خالد محمود'}).click();
 await expect(page.getByRole('menuitem',{name:'تعيين كلمة المرور',exact:true})).toBeDisabled();
 await expect(page.getByRole('menuitem',{name:'حذف المستخدم نهائياً'})).toHaveCount(0);
 await page.keyboard.press('Escape');
 await page.getByTestId(`row-supervisor-${uiId(205)}`).getByRole('button',{name:'تعديل بيانات المستخدم'}).click();
 await expect(page.getByRole('dialog',{name:'تعديل بيانات المستخدم'})).toBeVisible();
 expect(state.writes).toEqual([]);
});
test('mobile admin fits actions in viewport and reports failed alerts honestly',async({page})=>{
 await page.setViewportSize({width:390,height:844});const state=await setupUI(page);state.failAlerts=true;state.emptyTarget=true;
 await page.goto('/admin');
 await expect(page.getByText('لم يُحدد مستهدف لهذه الفترة')).toHaveCount(2);
 await expect(page.getByText('لا توجد تنبيهات متاحة')).toHaveCount(0);
 await expect(page.locator('.overview-alerts').getByRole('button',{name:'إعادة المحاولة'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 await page.goto('/admin/users');
 const main=await page.locator('.adm-main').boundingBox();expect(main!.x).toBeGreaterThanOrEqual(0);expect(main!.width).toBeLessThanOrEqual(390);
 await page.getByRole('button',{name:'إجراءات أحمد محمد'}).click();
 await expect(page.getByRole('menu')).toBeVisible();
 const box=await page.getByRole('menu').boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);
});
test('field home offers primary visit action and quiet idle sync in Arabic and English',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setupUI(page,'supervisor');await page.goto('/');
 await expect(page.getByTestId('button-new-visit')).toBeVisible();await expect(page.getByTestId('btn-sync-up')).toHaveCount(0);
 await expect(page.locator('.field-tools button')).toHaveCount(4);
 await page.getByTestId('button-language').click();
 await expect(page.locator('html')).toHaveAttribute('dir','ltr');
 await expect(page.getByRole('heading',{name:'Hello, خالد'})).toBeVisible();
 await expect(page.getByTestId('button-new-visit')).toContainText(/new visit/i);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
