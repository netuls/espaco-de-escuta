// Configuração pública. A anon key é pública por design (a segurança vem do RLS).
// NUNCA coloque aqui a secret / service_role.
window.APP_CONFIG = {
  SUPABASE_URL: "https://jepaqlzgbtjbhqaunmid.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcGFxbHpnYnRqYmhxYXVubWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzMyMjEsImV4cCI6MjEwODgwOTIyMX0.zqkBmjyA3Ej2Q5t8JNu7icE5pES90Tn6dQ_AKR4_R9g",
  LEADERS: ["Thais", "Victor", "Leiliane", "Gabriel", "Karen", "Teste"],
  // Endereço do painel da liderança. Deixe "" para NÃO mostrar o link no site.
  ADMIN_URL: "",
};
