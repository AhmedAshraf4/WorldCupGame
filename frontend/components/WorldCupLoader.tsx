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
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) return;

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

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      if (modelRoot) {
        modelRoot.rotation.x = elapsed * 1.45;
        modelRoot.rotation.y = elapsed * 1.05;
        modelRoot.rotation.z = elapsed * 0.55;
        group.position.y = Math.abs(Math.sin(elapsed * 2.1)) * 0.78;
      }

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

  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div className="relative flex h-80 w-80 items-center justify-center md:h-96 md:w-96">
        <div
          className="h-72 w-72 md:h-80 md:w-80"
          aria-hidden="true"
          ref={hostRef}
        />
      </div>

      <p className="wc-muted -mt-3 text-sm font-black uppercase tracking-[0.22em]">
        Loading
      </p>
    </div>
  );
}
