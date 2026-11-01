
export interface AdminCategory {
  id: string
  key: string
  name: string
  description: string
  displayOrder: number
  isActive: boolean
  totalListings: number
  publishedListings: number
  createdAt: string
  updatedAt: string
}

export interface AdminCategoriesResponse {
  status: string
  categories: AdminCategory[]
  total: number
  generatedAt: string
}

export interface CreateAdminCategoryInput {
  name: string
  description: string
  displayOrder: number
}

export interface UpdateAdminCategoryInput {
  name: string
  description: string
  displayOrder: number
}

async function readResponse(response: Response): Promise<unknown> {
  return response.json().catch(() => null)
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof data.error === 'string'
  ) {
    return data.error
  }

  return fallback
}

export async function getAdminCategories(): Promise<AdminCategoriesResponse> {
  const response = await fetch('/api/admin/categories', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  const data = await readResponse(response)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Unable to load categories (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('categories' in data) ||
    !Array.isArray(data.categories)
  ) {
    throw new Error('The category directory returned an invalid response.')
  }

  return data as AdminCategoriesResponse
}

export async function createAdminCategory(
  input: CreateAdminCategoryInput,
): Promise<{ message: string; category: AdminCategory }> {
  const response = await fetch('/api/admin/categories', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  const data = await readResponse(response)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Unable to create category (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('category' in data) ||
    !('message' in data) ||
    typeof data.message !== 'string'
  ) {
    throw new Error('The server returned an invalid category response.')
  }

  return data as { message: string; category: AdminCategory }
}

export async function updateAdminCategory(
  categoryId: string,
  input: UpdateAdminCategoryInput,
): Promise<{ message: string; category: AdminCategory }> {
  const response = await fetch(
    `/api/admin/categories/${encodeURIComponent(categoryId)}`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )

  const data = await readResponse(response)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Unable to update category (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('category' in data) ||
    !('message' in data) ||
    typeof data.message !== 'string'
  ) {
    throw new Error('The server returned an invalid category update response.')
  }

  return data as { message: string; category: AdminCategory }
}

export async function setAdminCategoryStatus(
  categoryId: string,
  isActive: boolean,
): Promise<{ message: string }> {
  const response = await fetch(
    `/api/admin/categories/${encodeURIComponent(categoryId)}/status`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive }),
    },
  )

  const data = await readResponse(response)

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        data,
        `Unable to change category status (HTTP ${response.status}).`,
      ),
    )
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !('message' in data) ||
    typeof data.message !== 'string'
  ) {
    throw new Error('The server returned an invalid category status response.')
  }

  return { message: data.message }
}
