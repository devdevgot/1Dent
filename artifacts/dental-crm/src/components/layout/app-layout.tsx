import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useLogout } from "@workspace/api-client-react";
import { 
  LayoutDashboard, 
  KanbanSquare, 
  MessageSquare, 
  Users, 
  Stethoscope, 
  BarChart3, 
  Settings, 
  LogOut,
  Menu,
  Activity,
  Calendar,
  Wallet,
  Package
} from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const ALL_NAV_ITEMS = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["owner", "admin", "doctor", "accountant", "warehouse"] },
  { name: "Kanban", href: "/kanban", icon: KanbanSquare, roles: ["owner", "admin"] },
  { name: "Chat", href: "/chat", icon: MessageSquare, roles: ["owner", "admin"] },
  { name: "Patients", href: "/patients", icon: Users, roles: ["owner", "admin", "doctor"] },
  { name: "Procedures", href: "/procedures", icon: Stethoscope, roles: ["owner", "admin", "doctor", "accountant"] },
  { name: "Schedule", href: "/schedule", icon: Calendar, roles: ["admin"] },
  { name: "Analytics", href: "/analytics", icon: BarChart3, roles: ["owner"] },
  { name: "Financials", href: "/financials", icon: Wallet, roles: ["accountant"] },
  { name: "Inventory", href: "/inventory", icon: Package, roles: ["warehouse"] },
  { name: "Users", href: "/users", icon: Settings, roles: ["owner"] },
  { name: "Activity Log", href: "/logs", icon: Activity, roles: ["owner"] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, clinic, clearAuth } = useAuthStore();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        clearAuth();
        setLocation("/login");
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to log out. Please try again.",
          variant: "destructive"
        });
      }
    }
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Filter nav items based on current user role
  const navItems = ALL_NAV_ITEMS.filter(item => 
    user && item.roles.includes(user.role)
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border/50 flex flex-col z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="h-20 flex items-center px-6 border-b border-border/50">
          <img 
            src={`${import.meta.env.BASE_URL}images/logo.png`} 
            alt="Logo" 
            className="w-10 h-10 object-contain mr-3"
          />
          <div className="flex flex-col">
            <span className="font-display font-bold text-lg leading-tight text-foreground">{clinic?.name || "Dental CRM"}</span>
            <span className="text-xs font-medium text-primary uppercase tracking-wider">{user?.role}</span>
          </div>
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const isActive = location === item.href || location.startsWith(`${item.href}/`);
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={`
                  flex items-center px-3 py-3 rounded-xl transition-all duration-200 group
                  ${isActive 
                    ? "bg-primary/10 text-primary font-semibold" 
                    : "text-muted-foreground hover:bg-slate-100 hover:text-foreground font-medium"
                  }
                `}
              >
                <item.icon className={`w-5 h-5 mr-3 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-border/50">
          <div className="flex items-center px-3 py-3 mb-2 rounded-xl bg-slate-50">
            <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm mr-3">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-semibold truncate text-foreground">{user?.name}</span>
              <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            className="w-full flex items-center justify-center px-3 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {logoutMutation.isPending ? "Logging out..." : "Log out"}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-50/50">
        <header className="h-20 bg-white/60 backdrop-blur-md border-b border-border/50 flex items-center px-8 z-10 sticky top-0">
          <h1 className="text-2xl font-display font-bold text-foreground capitalize">
            {location.split('/')[1] || 'Dashboard'}
          </h1>
        </header>
        
        <div className="flex-1 overflow-auto p-8 animate-in-fade">
          {children}
        </div>
      </main>
    </div>
  );
}
