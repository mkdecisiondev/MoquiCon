Feature("Schedule Page");

Scenario("Click Schedule on NavBar", I => {
  I.amOnPage("/");
  I.see("MoquiCon");
  I.click("Schedule");
  I.amOnPage("/schedule");
  I.seeElement({ css: "iframe" });
});
