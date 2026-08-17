export default function ThemeBootstrap() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(()=>{try{const r=document.documentElement;const b=location.pathname.startsWith("/dewu-")?"/dewu-":"";r.style.setProperty("--cirrus-sky-image",'url("'+b+'/images/sky-horizon-hero.webp")');const t=localStorage.getItem("dewu_app_theme");const c={cirrus:"#b8d4f1",spritecraft:"#f4e9c8",voltura:"#15191a",lumen:"#1b1c22"};if(c[t]){r.dataset.theme=t;document.querySelector('meta[name="theme-color"]')?.setAttribute("content",c[t])}}catch{}})();`,
      }}
    />
  );
}
