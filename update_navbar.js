const fs = require('fs');

const path = './src/components/dashboard/AurtisticNavbar.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Update the profile image logic
const oldImgLogic = `                  ) : user?.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ? (
                    <img src="/perfil.jpeg" alt="Profile" className="w-full h-full object-cover" />
                  ) : (`;

const newImgLogic = `                  ) : (user?.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' && profile?.features_config?.advanced_settings?.sync_curriculum_photo !== false) ? (
                    <img src="/perfil.jpeg" alt="Profile" className="w-full h-full object-cover" />
                  ) : (`;

code = code.replace(oldImgLogic, newImgLogic);

// 2. Add Link to /configuracoes-avancadas
const oldWidgetLink = `                    <Link 
                      href="/configurar-widget"
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-full text-left px-4 py-2 text-sm text-[#E0E0E0] hover:bg-[#2D2D2D] hover:text-[#FFCC00] transition-colors flex items-center gap-2 group"
                    >
                      <span className="material-symbols-outlined text-[18px]">widgets</span>
                      Configurar Widget
                    </Link>`;

const newLinks = `                    <Link 
                      href="/configurar-widget"
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-full text-left px-4 py-2 text-sm text-[#E0E0E0] hover:bg-[#2D2D2D] hover:text-[#FFCC00] transition-colors flex items-center gap-2 group"
                    >
                      <span className="material-symbols-outlined text-[18px]">widgets</span>
                      Configurar Widget
                    </Link>

                    <Link 
                      href="/configuracoes-avancadas"
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-full text-left px-4 py-2 text-sm text-[#E0E0E0] hover:bg-[#2D2D2D] hover:text-[#9D4EDD] transition-colors flex items-center gap-2 group"
                    >
                      <span className="material-symbols-outlined text-[18px]">tune</span>
                      Configurações Avançadas
                    </Link>`;

code = code.replace(oldWidgetLink, newLinks);

fs.writeFileSync(path, code);
console.log('Navbar updated.');
