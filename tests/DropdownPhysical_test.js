Feature("Ticket Dropdown");

Scenario("Click Dropdown and Click Physical Tickets", I => {
  I.amOnPage("/");
  I.see("MoquiCon");
  I.click("Tickets");
  I.click("Physical Tickets");
  I.amOnPage("/tickets/MOQUICON_PT_2019");
});
