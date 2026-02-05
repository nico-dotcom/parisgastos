/**
 * Íconos simplificados usando solo los 6 iconos del formulario de gastos.
 * Cada categoría de Splitwise se mapea a uno de estos 6 iconos según su tipo.
 * IDs = id de la tabla splitwise_categories (base de datos).
 */
export const CATEGORY_MATERIAL_ICONS: Record<number, string> = {
  // Utilidades (1) - cafe (servicios generales)
  1: 'coffee',
  8: 'coffee',   // Limpieza
  9: 'coffee',   // Electricidad
  10: 'coffee',  // Calefacción
  11: 'coffee',  // Otro (util)
  12: 'coffee',  // Basura
  13: 'coffee',  // TV/teléfono/Internet
  14: 'coffee',  // Agua

  // Sin categoría (2) - coffee (default)
  2: 'coffee',
  15: 'coffee',  // General

  // Entretenimiento (3) - confirmation_number (entradas/eventos)
  3: 'confirmation_number',
  16: 'confirmation_number',  // Juegos
  17: 'confirmation_number',  // Películas
  18: 'confirmation_number',  // Música
  19: 'confirmation_number',  // Otro (entretenimiento)
  20: 'confirmation_number',  // Deportes

  // Comidas y bebidas (4) - restaurant/local_bar/local_grocery_store
  4: 'coffee',              // Comidas y bebidas (parent)
  21: 'restaurant',         // Restaurantes
  22: 'local_grocery_store', // Alimentos
  23: 'local_bar',          // Licor
  24: 'restaurant',         // Otro (comida)

  // Casa (5) - coffee (servicios del hogar)
  5: 'coffee',
  25: 'coffee',  // Electrónica
  26: 'coffee',  // Muebles
  27: 'coffee',  // Suministros del hogar
  28: 'coffee',  // Mantenimiento
  29: 'coffee',  // Hipoteca
  30: 'coffee',  // Otro (casa)
  31: 'coffee',  // Mascotas
  32: 'coffee',  // Alquiler
  33: 'coffee',  // Servicios

  // Transporte (6) - subway
  6: 'subway',
  34: 'subway',  // Bicicleta
  35: 'subway',  // Autobús/tren
  36: 'subway',  // Coche
  37: 'subway',  // Gasolina
  38: 'subway',  // Hotel
  39: 'subway',  // Otro (transporte)
  40: 'subway',  // Estacionamiento
  41: 'subway',  // Avión
  42: 'subway',  // Taxi

  // Vida (7) - coffee (gastos personales)
  7: 'coffee',
  43: 'coffee',  // Guardería
  44: 'coffee',  // Ropa (compras personales)
  45: 'coffee',  // Formación
  46: 'coffee',  // Regalos
  47: 'coffee',  // Seguro
  48: 'coffee',  // Gastos médicos
  49: 'coffee',  // Otro (vida)
  50: 'coffee',  // Impuestos
}

const DEFAULT_ICON = 'coffee'

/**
 * Devuelve el nombre del Material Symbol para una categoría por su id (base de datos).
 * Usar en toda la app en lugar del icon URL de la BD.
 */
export function getCategoryMaterialIcon(categoryId: number | string | undefined | null): string {
  if (categoryId === undefined || categoryId === null) return DEFAULT_ICON
  const id = typeof categoryId === 'string' ? parseInt(categoryId, 10) : categoryId
  if (!Number.isFinite(id)) return DEFAULT_ICON
  return CATEGORY_MATERIAL_ICONS[id] ?? DEFAULT_ICON
}
