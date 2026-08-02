#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Prepara as fotos 360deg da Villela Stay para o tour virtual do site.

O que faz com cada panorama equirretangular:
  1. valida a proporcao 2:1 e, se a foto for um "photo sphere" cortado
     (celular/Insta360 gravam a area util em metadados GPano), recompoe o
     quadro inteiro antes de qualquer coisa;
  2. gera as versoes que o visualizador consome: 1024 (preview instantaneo),
     2048 (celular) e 4096 (desktop) -- nunca acima da resolucao original;
  3. gera a miniatura do seletor de cenas em projecao RETILINEA (a vista que
     um olho humano teria), nao o equirretangular esticado que fica horrivel;
  4. faz upsert em src/tour360/cenas.json preservando tudo que foi editado a
     mao (titulo, hotspots, vista inicial) -- rodar de novo nunca perde ajuste.

Uso:
    python tools/preparar-360.py --origem "C:/caminho/das/fotos360"
    python tools/preparar-360.py --origem ... --casa "Villa Kubitschek" --imovel GG04I
    python tools/preparar-360.py --listar     (so inspeciona, nao grava nada)

Depende so de Pillow + numpy (ja instalados na maquina do Augusto).
"""

import argparse
import json
import os
import re
import sys
import unicodedata

try:
    import numpy as np
    from PIL import Image
except ImportError as e:  # pragma: no cover
    sys.exit("Falta dependencia: %s. Instale com: pip install pillow numpy" % e.name)

Image.MAX_IMAGE_PIXELS = None  # panoramas passam do limite anti-bomba do Pillow

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "src", "tour360", "panoramas")
MANIFESTO = os.path.join(RAIZ, "src", "tour360", "cenas.json")

LARGURAS = [1024, 2048, 4096]
THUMB = (400, 225)
EXTENSOES = (".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff")


# --------------------------------------------------------------- utilidades
def slug(texto):
    """'Sala de Estar 01.JPG' -> 'sala-de-estar-01'"""
    base = os.path.splitext(os.path.basename(texto))[0]
    base = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-zA-Z0-9]+", "-", base).strip("-").lower()
    return base or "cena"


def titulo_humano(nome_slug):
    """'sala-de-estar-01' -> 'Sala de Estar 01' (ponto de partida editavel)."""
    palavras = [p for p in nome_slug.split("-") if p]
    miudas = {"de", "da", "do", "das", "dos", "e", "com", "na", "no"}
    saida = []
    for i, p in enumerate(palavras):
        saida.append(p if (i and p in miudas) else p.capitalize())
    return " ".join(saida)


def ler_gpano(caminho):
    """Le os campos GPano do XMP sem dependencia extra (o XMP e XML em texto puro).

    Celular e camera 360 frequentemente entregam um panorama CORTADO (faltando
    faixa no topo/base) e registram nos metadados onde aquele pedaco fica no
    quadro completo. Sem recompor, o tour mostra a cena inclinada e esmagada.
    """
    try:
        with open(caminho, "rb") as f:
            bruto = f.read(512 * 1024)  # o XMP fica no comeco do arquivo
    except OSError:
        return None
    try:
        texto = bruto.decode("utf-8", "ignore")
    except Exception:
        return None
    if "GPano:" not in texto:
        return None
    campos = {}
    for chave in ("FullPanoWidthPixels", "FullPanoHeightPixels",
                  "CroppedAreaImageWidthPixels", "CroppedAreaImageHeightPixels",
                  "CroppedAreaLeftPixels", "CroppedAreaTopPixels"):
        m = re.search(r'GPano:%s\s*=\s*"(\d+)"' % chave, texto) or \
            re.search(r"<GPano:%s>(\d+)</GPano:%s>" % (chave, chave), texto)
        if m:
            campos[chave] = int(m.group(1))
    obrigatorios = ("FullPanoWidthPixels", "FullPanoHeightPixels",
                    "CroppedAreaImageWidthPixels", "CroppedAreaImageHeightPixels")
    if not all(k in campos for k in obrigatorios):
        return None
    campos.setdefault("CroppedAreaLeftPixels", 0)
    campos.setdefault("CroppedAreaTopPixels", 0)
    return campos


def recompor(img, g):
    """Cola o pedaco fotografado na posicao certa dentro do quadro 360 completo."""
    if (g["CroppedAreaImageWidthPixels"] == g["FullPanoWidthPixels"] and
            g["CroppedAreaImageHeightPixels"] == g["FullPanoHeightPixels"]):
        return img, False
    cheio = Image.new("RGB", (g["FullPanoWidthPixels"], g["FullPanoHeightPixels"]), (18, 20, 22))
    parte = img.resize((g["CroppedAreaImageWidthPixels"], g["CroppedAreaImageHeightPixels"]), Image.LANCZOS)
    cheio.paste(parte, (g["CroppedAreaLeftPixels"], g["CroppedAreaTopPixels"]))
    return cheio, True


def retilinea(img, largura, altura, yaw=0.0, pitch=0.0, fov=75.0):
    """Renderiza uma vista de camera normal a partir do equirretangular.

    Mesma matematica do visualizador WebGL, so que em numpy: monta o raio de
    cada pixel, gira por (yaw, pitch) e amostra o panorama com bilinear.
    """
    src = np.asarray(img.convert("RGB"), dtype=np.float32)
    H, W = src.shape[0], src.shape[1]

    tan = np.tan(np.radians(fov) / 2.0)
    aspecto = largura / float(altura)
    xs = (np.arange(largura, dtype=np.float32) + 0.5) / largura * 2.0 - 1.0
    ys = 1.0 - (np.arange(altura, dtype=np.float32) + 0.5) / altura * 2.0
    gx, gy = np.meshgrid(xs * tan * aspecto, ys * tan)
    gz = np.full_like(gx, -1.0)

    n = np.sqrt(gx * gx + gy * gy + gz * gz)
    gx, gy, gz = gx / n, gy / n, gz / n

    # Ry(-yaw) * Rx(pitch) -- mesma convencao do visualizador (yaw+ = direita).
    cy, sy = np.cos(np.radians(yaw)), np.sin(np.radians(yaw))
    cp, sp = np.cos(np.radians(pitch)), np.sin(np.radians(pitch))
    dx = cy * gx + (-sy * sp) * gy + (-sy * cp) * gz
    dy = cp * gy + (-sp) * gz
    dz = sy * gx + (cy * sp) * gy + (cy * cp) * gz

    u = (np.arctan2(dx, -dz) / (2.0 * np.pi) + 0.5) * W
    v = (np.arccos(np.clip(dy, -1.0, 1.0)) / np.pi) * H

    x0 = np.floor(u).astype(np.int32)
    y0 = np.clip(np.floor(v).astype(np.int32), 0, H - 1)
    fx = (u - x0)[..., None]
    fy = (v - y0)[..., None]
    x0 %= W
    x1 = (x0 + 1) % W
    y1 = np.clip(y0 + 1, 0, H - 1)

    topo = src[y0, x0] * (1 - fx) + src[y0, x1] * fx
    base = src[y1, x0] * (1 - fx) + src[y1, x1] * fx
    return Image.fromarray(np.clip(topo * (1 - fy) + base * fy, 0, 255).astype(np.uint8))


def gravar(img, caminho, qualidade):
    img.convert("RGB").save(caminho, "JPEG", quality=qualidade, optimize=True, progressive=True)
    return os.path.getsize(caminho)


def mb(n):
    return "%.1f MB" % (n / 1048576.0)


# --------------------------------------------------------------- manifesto
def carregar_manifesto():
    if not os.path.exists(MANIFESTO):
        return {"cenas": []}
    with open(MANIFESTO, "r", encoding="utf-8") as f:
        return json.load(f)


def salvar_manifesto(dados):
    with open(MANIFESTO, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        f.write("\n")


def upsert(dados, nova):
    """Insere ou atualiza a cena SEM pisar no que foi editado a mao."""
    for cena in dados["cenas"]:
        if cena["id"] == nova["id"]:
            # So os campos derivados do arquivo sao reescritos.
            cena["arquivo"] = nova["arquivo"]
            cena["larguras"] = nova["larguras"]
            if nova.get("casa"):
                cena["casa"] = nova["casa"]
            if nova.get("imovel"):
                cena["imovel"] = nova["imovel"]
            return "atualizada"
    dados["cenas"].append(nova)
    return "nova"


# --------------------------------------------------------------- principal
def processar(caminho, args, dados):
    nome = slug(caminho)
    with Image.open(caminho) as bruta:
        bruta.load()
        img = bruta.convert("RGB")

    g = ler_gpano(caminho)
    recomposta = False
    if g:
        img, recomposta = recompor(img, g)

    W, H = img.size
    razao = W / float(H)
    aviso = ""
    if abs(razao - 2.0) > 0.02:
        aviso = "  !! proporcao %.2f:1 (o esperado num 360 completo e 2:1)" % razao

    print("\n%s" % os.path.basename(caminho))
    print("  %dx%d px%s%s" % (W, H, "  [quadro recomposto pelos metadados GPano]" if recomposta else "", aviso))

    if args.listar:
        return None

    if abs(razao - 2.0) > 0.02 and not args.forcar:
        print("  -> PULADA. Se a foto for mesmo 360, rode de novo com --forcar (sera esticada para 2:1).")
        return None
    if abs(razao - 2.0) > 0.02:
        img = img.resize((W, W // 2), Image.LANCZOS)
        W, H = img.size
        print("  -> esticada para %dx%d" % (W, H))

    os.makedirs(DESTINO, exist_ok=True)
    larguras = [l for l in LARGURAS if l <= W] or [min(LARGURAS)]
    if larguras[-1] < W and W < larguras[-1] * 1.35:
        pass  # original so um pouco maior que o maior degrau: nao vale um degrau novo

    geradas, total = [], 0
    for largura in larguras:
        destino = os.path.join(DESTINO, "%s-%d.jpg" % (nome, largura))
        red = img.resize((largura, largura // 2), Image.LANCZOS)
        # Qualidade menor nas versoes grandes: em 4096 o olho nao ve a diferenca
        # e a foto pesa metade.
        tam = gravar(red, destino, 90 if largura <= 1024 else (85 if largura <= 2048 else 80))
        geradas.append(largura)
        total += tam
        print("  %-6d -> %-28s %s" % (largura, os.path.basename(destino), mb(tam)))

    thumb = retilinea(img, THUMB[0], THUMB[1], yaw=args.thumb_yaw, pitch=args.thumb_pitch, fov=75.0)
    tam = gravar(thumb, os.path.join(DESTINO, "%s-thumb.jpg" % nome), 82)
    total += tam
    print("  thumb  -> %-28s %s  (projecao retilinea)" % ("%s-thumb.jpg" % nome, mb(tam)))

    estado = upsert(dados, {
        "id": nome,
        "arquivo": nome,
        "casa": args.casa or "",
        "imovel": args.imovel or "",
        "titulo": titulo_humano(nome),
        "larguras": geradas,
        "vistaInicial": {"yaw": 0, "pitch": 0, "fov": 75},
        "hotspots": []
    })
    print("  cena %s no manifesto (id: %s)" % (estado, nome))
    return total


def main():
    p = argparse.ArgumentParser(description="Prepara fotos 360 para o tour virtual da Villela Stay.")
    p.add_argument("--origem", help="pasta (ou arquivo) com as fotos 360 originais")
    p.add_argument("--casa", default="", help='nome da casa, ex.: "Villa Kubitschek"')
    p.add_argument("--imovel", default="", help="codigo do anuncio na Stays, ex.: GG04I")
    p.add_argument("--thumb-yaw", type=float, default=0.0, help="angulo horizontal da miniatura (graus)")
    p.add_argument("--thumb-pitch", type=float, default=0.0, help="angulo vertical da miniatura (graus)")
    p.add_argument("--listar", action="store_true", help="so inspeciona as fotos, nao grava nada")
    p.add_argument("--forcar", action="store_true", help="processa mesmo sem a proporcao 2:1")
    args = p.parse_args()

    if not args.origem:
        p.print_help()
        print("\nDica: comece com --listar para conferir se as fotos estao em 2:1.")
        return 1

    origem = os.path.abspath(args.origem)
    if os.path.isfile(origem):
        arquivos = [origem]
    elif os.path.isdir(origem):
        arquivos = sorted(os.path.join(origem, f) for f in os.listdir(origem)
                          if f.lower().endswith(EXTENSOES))
    else:
        print("Pasta ou arquivo nao encontrado: %s" % origem)
        return 1

    if not arquivos:
        print("Nenhuma imagem em %s (extensoes aceitas: %s)" % (origem, ", ".join(EXTENSOES)))
        return 1

    print("Origem : %s" % origem)
    print("Destino: %s" % DESTINO)
    print("%d imagem(ns) encontrada(s)." % len(arquivos))

    dados = carregar_manifesto()
    total, feitas = 0, 0
    for caminho in arquivos:
        try:
            tam = processar(caminho, args, dados)
        except Exception as e:
            print("\n%s\n  ERRO: %s" % (os.path.basename(caminho), e))
            continue
        if tam:
            total += tam
            feitas += 1

    if not args.listar and feitas:
        # Agrupa por casa PRESERVANDO a ordem ja existente no manifesto: a ordem das
        # cenas e o roteiro da visita (comeca pela area mais bonita, banheiro por
        # ultimo) e foi definida a mao -- ordenar por titulo faria o tour abrir num
        # banheiro. Cena nova entra no fim do grupo da sua casa.
        casas, por_casa = [], {}
        for c in dados["cenas"]:
            k = c.get("casa", "")
            if k not in por_casa:
                casas.append(k); por_casa[k] = []
            por_casa[k].append(c)
        dados["cenas"] = [c for k in casas for c in por_casa[k]]
        salvar_manifesto(dados)
        print("\n%d cena(s) processada(s) — %s no total." % (feitas, mb(total)))
        print("Manifesto: %s" % MANIFESTO)
        print("\nProximos passos:")
        print("  1. revise titulos/hotspots em cenas.json")
        print("  2. node build.js")
        print("  3. abra dist/tour.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
