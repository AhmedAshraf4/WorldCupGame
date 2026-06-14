"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type WorldCupLoaderProps = {
  className?: string;
};

const BALL_ASSET = "/assets/fifa-trionda-ball-world-cup-2026.glb";

export function WorldCupLoader({
  className = "",
}: WorldCupLoaderProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const motionRef = useRef({
    initialized: false,
    lastTime: 0,
    x: 0,
    y: 0,
    velocityX: 2.2,
    velocityY: -11,
  });

  useEffect(() => {
    const host = hostRef.current;
    const stage = stageRef.current;

    if (!host || !stage) return;

    let animationFrame = 0;
    let disposed = false;
    let modelRoot: THREE.Group | null = null;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0, 4.4);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1b2740, 2.4));

    const keyLight = new THREE.DirectionalLight(0xfff2c2, 3.2);
    keyLight.position.set(2.8, 4.2, 3.4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6ee7ff, 1.8);
    rimLight.position.set(-3.4, 1.6, -2.2);
    scene.add(rimLight);

    const resize = () => {
      const size = Math.max(
        96,
        Math.min(host.clientWidth, host.clientHeight) || host.clientWidth
      );

      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const loader = new GLTFLoader();
    loader.load(
      BALL_ASSET,
      (gltf) => {
        if (disposed) return;

        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxSize = Math.max(size.x, size.y, size.z) || 1;

        model.position.sub(center);
        model.scale.setScalar(0.95 / maxSize);
        model.rotation.set(0, 0, 0);
        group.position.set(-0.28, 0.28, 0);

        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });

        group.add(model);
        modelRoot = model;
      },
      undefined,
      undefined
    );

    const clock = new THREE.Clock();

    const placeInViewport = () => {
      const motion = motionRef.current;

      if (motion.initialized) return;

      const hostWidth = host.clientWidth || 288;
      const hostHeight = host.clientHeight || 288;

      motion.x = window.innerWidth / 2 - hostWidth / 2;
      motion.y = Math.max(24, window.innerHeight * 0.46 - hostHeight / 2);
      motion.initialized = true;
    };

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const motion = motionRef.current;
      const now = performance.now();
      const delta = motion.lastTime
        ? Math.min(32, now - motion.lastTime) / 16.67
        : 1;

      motion.lastTime = now;
      placeInViewport();

      if (modelRoot) {
        modelRoot.rotation.x = elapsed * 1.8;
        modelRoot.rotation.y = elapsed * 1.35;
        modelRoot.rotation.z = elapsed * 0.7;
      }

      const hostWidth = host.clientWidth || 288;
      const hostHeight = host.clientHeight || 288;
      const minX = 0;
      const maxX = Math.max(0, window.innerWidth - hostWidth);
      const minY = 0;
      const maxY = Math.max(0, window.innerHeight - hostHeight - 34);

      motion.velocityY += 0.55 * delta;
      motion.x += motion.velocityX * delta;
      motion.y += motion.velocityY * delta;

      if (motion.x <= minX) {
        motion.x = minX;
        motion.velocityX = Math.abs(motion.velocityX) * 0.88;
      } else if (motion.x >= maxX) {
        motion.x = maxX;
        motion.velocityX = -Math.abs(motion.velocityX) * 0.88;
      }

      if (motion.y <= minY) {
        motion.y = minY;
        motion.velocityY = Math.abs(motion.velocityY) * 0.82;
      } else if (motion.y >= maxY) {
        motion.y = maxY;
        motion.velocityY = -Math.max(8, Math.abs(motion.velocityY) * 0.82);
        motion.velocityX *= 0.96;
      }

      host.style.transform = `translate3d(${motion.x}px, ${motion.y}px, 0)`;

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();

          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];

          materials.forEach((material) => material.dispose());
        }
      });
      renderer.domElement.remove();
    };
  }, []);

  function kickAwayFromPoint(clientX: number, clientY: number) {
    const host = hostRef.current;

    if (!host) return;

    const motion = motionRef.current;
    const hostRect = host.getBoundingClientRect();
    const centerX = hostRect.left + hostRect.width / 2;
    const centerY = hostRect.top + hostRect.height / 2;
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    const distance = Math.max(32, Math.hypot(deltaX, deltaY));
    const directionX = -deltaX / distance;
    const directionY = -deltaY / distance;

    motion.velocityX = Math.max(
      -18,
      Math.min(18, motion.velocityX + directionX * 13)
    );
    motion.velocityY = Math.max(
      -22,
      Math.min(18, motion.velocityY + directionY * 15)
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div
        className="pointer-events-none fixed inset-0 z-50 touch-none"
        aria-hidden="true"
        ref={stageRef}
      >
        <div
          className="pointer-events-auto fixed left-0 top-0 h-72 w-72 cursor-pointer overflow-hidden md:h-80 md:w-80"
          onPointerDown={(event) => kickAwayFromPoint(event.clientX, event.clientY)}
          ref={hostRef}
        />
        <div className="pointer-events-none fixed inset-x-0 bottom-8 h-px bg-white/15" />
      </div>

      <p className="wc-muted fixed bottom-3 left-1/2 z-50 -translate-x-1/2 text-sm font-black uppercase tracking-[0.22em]">
        Loading
      </p>
    </div>
  );
}
