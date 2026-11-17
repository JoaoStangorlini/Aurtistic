// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useRef } from 'react';

interface MatrixCodeRainProps {
  className?: string;
  opacity?: number;
  speed?: number;
}

/**
 * Chuva Digital Matrix (Fundo oficial do Hackerspace - HS IFUSP).
 * Adapta-se automaticamente a data-theme-mode="light" | "dark".
 */
export function MatrixCodeRain({
  className = '',
  opacity = 0.45,
  speed = 36,
}: MatrixCodeRainProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId = 0;
    let lastTime = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener('resize', resize);

    const characters = '0101010101100111日ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ∂∇ħΨΣΩλπ';
    const fontSize = 15;
    const columns = Math.max(1, Math.floor(canvas.width / fontSize));
    const maxRows = Math.max(1, Math.floor(canvas.height / fontSize));
    let drops: number[] = Array.from({ length: columns }, () => Math.floor(Math.random() * maxRows));

    const isLightMode = () =>
      document.documentElement.getAttribute('data-theme-mode') === 'light';

    let currentLight = isLightMode();
    ctx.fillStyle = currentLight ? '#F8FAFC' : '#030805';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const observer = new MutationObserver(() => {
      const lightNow = isLightMode();
      if (lightNow !== currentLight) {
        currentLight = lightNow;
        ctx.fillStyle = currentLight ? '#F8FAFC' : '#030805';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme-mode'],
    });

    const draw = (currentTime: number) => {
      if (currentTime - lastTime < speed) {
        animationFrameId = requestAnimationFrame(draw);
        return;
      }
      lastTime = currentTime;

      const light = isLightMode();
      ctx.fillStyle = light ? 'rgba(248, 250, 252, 0.16)' : 'rgba(3, 8, 5, 0.16)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'bold 14px monospace';

      const currentColumns = Math.max(1, Math.floor(canvas.width / fontSize));
      if (currentColumns !== drops.length) {
        drops = Array.from(
          { length: currentColumns },
          (_, i) => drops[i] ?? Math.floor(Math.random() * maxRows)
        );
      }

      for (let i = 0; i < drops.length; i++) {
        const char = characters[Math.floor(Math.random() * characters.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        const isHead = Math.random() > 0.88;

        if (light) {
          ctx.fillStyle = isHead ? '#004d1a' : '#008a2e';
          ctx.shadowColor = '#00bb3f';
          ctx.shadowBlur = isHead ? 2 : 0;
        } else {
          ctx.fillStyle = isHead ? '#FFFFFF' : '#00FF66';
          ctx.shadowColor = '#00FF66';
          ctx.shadowBlur = isHead ? 8 : 4;
        }

        ctx.fillText(char, x, y);
        ctx.shadowBlur = 0;

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      observer.disconnect();
    };
  }, [speed]);

  return (
    <canvas
      ref={canvasRef}
      style={{ opacity }}
      className={`pointer-events-none fixed inset-0 w-full h-full z-0 ${className}`}
    />
  );
}

